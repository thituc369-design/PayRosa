import { createHash } from 'node:crypto';
import {
  Account,
  Address,
  Asset,
  Contract,
  Keypair,
  nativeToScVal,
  rpc,
  scValToNative,
  type Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import { env, USDC_ASSET_ISSUER_VALUE } from '@/server/config/env';
import { AppError } from '@/server/lib/http';
import { getNetworkPassphrase } from './network';

/**
 * PayRosa invoice-escrow contract glue.
 *
 * The browser only ever *signs* — every RPC round-trip (simulate / submit /
 * poll) runs here on the server, so the client never has to talk to Soroban RPC
 * directly. The lifecycle is:
 *
 *   buildDepositXdr()  -> client signs -> submitSigned()   (funds escrow)
 *   release()          -> admin signs (server)             (instant payout)
 *   refund()           -> admin signs (server)             (cancel before release)
 */

const PAYOUT_DECIMALS = 7; // XLM/USDC SAC minor units (stroops).
// Inclusion-fee cap (stroops). Deliberately well above BASE_FEE so a deposit /
// release is not dropped under testnet congestion. Soroban resource fees are
// added on top by `assembleTransaction`; this is only the max we'll pay.
const INCLUSION_FEE = '1000000';

function server(): rpc.Server {
  const url = env.SOROBAN_RPC_URL;
  return new rpc.Server(url, { allowHttp: url.startsWith('http://') });
}

function requireContractId(): string {
  if (!env.SOROBAN_ESCROW_CONTRACT_ID) {
    throw new AppError('INTERNAL', 'Escrow contract id is not configured', 500);
  }
  return env.SOROBAN_ESCROW_CONTRACT_ID;
}

function adminKeypair(): Keypair {
  if (!env.ESCROW_ADMIN_SECRET) {
    throw new AppError('INTERNAL', 'Escrow admin key is not configured', 500);
  }
  return Keypair.fromSecret(env.ESCROW_ADMIN_SECRET);
}

/** Deterministic 32-byte escrow key = sha256(invoice id). Matches the client. */
export function invoiceRef(invoiceId: string): Buffer {
  return createHash('sha256').update(invoiceId, 'utf8').digest();
}

/** SAC (Stellar Asset Contract) id for an invoice asset. */
export function tokenContractId(asset: 'XLM' | 'USDC'): string {
  if (asset === 'XLM') return env.NATIVE_SAC_ID;
  return new Asset(env.USDC_ASSET_CODE, USDC_ASSET_ISSUER_VALUE).contractId(getNetworkPassphrase());
}

/** Decimal amount string ("1.5") -> i128 stroops bigint. */
export function toStroops(amount: string): bigint {
  const [whole, frac = ''] = amount.split('.');
  const padded = (frac + '0'.repeat(PAYOUT_DECIMALS)).slice(0, PAYOUT_DECIMALS);
  return BigInt(whole || '0') * 10n ** BigInt(PAYOUT_DECIMALS) + BigInt(padded || '0');
}

function refScVal(invoiceId: string): xdr.ScVal {
  return nativeToScVal(invoiceRef(invoiceId), { type: 'bytes' });
}

async function loadAccount(pubKey: string): Promise<Account> {
  return server().getAccount(pubKey);
}

/**
 * Build an UNSIGNED, simulation-assembled `deposit` transaction for the payer to
 * sign with their wallet. Returns the XDR.
 */
export async function buildDepositXdr(params: {
  invoiceId: string;
  payer: string;
  freelancer: string;
  asset: 'XLM' | 'USDC';
  amount: string;
}): Promise<string> {
  const contract = new Contract(requireContractId());
  const token = tokenContractId(params.asset);
  const op = contract.call(
    'deposit',
    refScVal(params.invoiceId),
    new Address(params.payer).toScVal(),
    new Address(params.freelancer).toScVal(),
    new Address(token).toScVal(),
    nativeToScVal(toStroops(params.amount), { type: 'i128' }),
  );

  const source = await loadAccount(params.payer);
  const tx = new TransactionBuilder(source, {
    fee: INCLUSION_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(op)
    .setTimeout(180)
    .build();

  const sim = await server().simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new AppError('INVALID_INPUT', `Deposit simulation failed: ${sim.error}`, 400);
  }
  return rpc.assembleTransaction(tx, sim).build().toXDR();
}

/** Submit a signed transaction and wait for the ledger to confirm it. */
export async function submitSigned(signedXdr: string): Promise<string> {
  const tx = TransactionBuilder.fromXDR(signedXdr, getNetworkPassphrase()) as Transaction;
  return sendAndConfirm(server(), tx);
}

/**
 * Send a signed tx and poll until it lands. Re-submits the (idempotent) tx if it
 * stalls in the mempool — testnet occasionally drops a transaction under load,
 * and re-injecting the same envelope lets it land instead of silently timing out.
 */
async function sendAndConfirm(srv: rpc.Server, tx: Transaction): Promise<string> {
  let sent = await srv.sendTransaction(tx);
  if (sent.status === 'ERROR') {
    throw new AppError('INVALID_INPUT', `Transaction rejected: ${JSON.stringify(sent.errorResult)}`, 400);
  }
  const hash = sent.hash;
  for (let i = 0; i < 26; i++) {
    const got = await srv.getTransaction(hash);
    if (got.status === 'SUCCESS') return hash;
    if (got.status === 'FAILED') {
      throw new AppError('INTERNAL', `Transaction ${hash} failed on-chain`, 400);
    }
    // Still NOT_FOUND — testnet drops Soroban txs under load. Re-inject the same
    // (idempotent) envelope every ~4.5s so a dropped tx still gets a ledger.
    if (i > 0 && i % 3 === 0) {
      sent = await srv.sendTransaction(tx).catch(() => sent);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new AppError('INTERNAL', `Timed out waiting for ${hash}`, 504);
}

/** Run an admin-signed invocation (release / refund) end to end. */
async function adminInvoke(method: 'release' | 'refund', invoiceId: string): Promise<string> {
  const admin = adminKeypair();
  const contract = new Contract(requireContractId());
  const op = contract.call(method, refScVal(invoiceId), new Address(admin.publicKey()).toScVal());

  const srv = server();
  const source = await loadAccount(admin.publicKey());
  const tx = new TransactionBuilder(source, {
    fee: INCLUSION_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(op)
    .setTimeout(180)
    .build();

  // The deposit was just confirmed, but the public Soroban RPC pool is eventually
  // consistent: a release simulation can briefly hit a node that has not yet
  // applied the deposit ledger and trap with EscrowNotFound (#7). Retry until the
  // node catches up rather than failing a settlement that is genuinely valid.
  let sim = await srv.simulateTransaction(tx);
  for (let i = 0; i < 6 && rpc.Api.isSimulationError(sim); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    sim = await srv.simulateTransaction(tx);
  }
  if (rpc.Api.isSimulationError(sim)) {
    throw new AppError('INVALID_INPUT', `${method} simulation failed: ${sim.error}`, 400);
  }
  const prepared = rpc.assembleTransaction(tx, sim).build();
  prepared.sign(admin);
  return sendAndConfirm(srv, prepared);
}

export type EscrowState = {
  client: string;
  freelancer: string;
  amount: bigint;
  status: 'Funded' | 'Released' | 'Refunded';
};

/** Read an escrow via simulation (no fee, no signature). Null if none exists. */
export async function getEscrowState(invoiceId: string): Promise<EscrowState | null> {
  const contract = new Contract(requireContractId());
  const op = contract.call('get_escrow', refScVal(invoiceId));
  const source = new Account(adminKeypair().publicKey(), '0');
  const tx = new TransactionBuilder(source, {
    fee: INCLUSION_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  // Retry on a trapping simulation: a just-funded escrow may be momentarily
  // invisible on a lagging RPC node (eventual consistency). After the retries a
  // persistent trap means the escrow genuinely does not exist -> null.
  let sim = await server().simulateTransaction(tx);
  for (let i = 0; i < 5 && rpc.Api.isSimulationError(sim); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    sim = await server().simulateTransaction(tx);
  }
  if (rpc.Api.isSimulationError(sim)) return null; // EscrowNotFound traps -> treat as absent
  const retval = sim.result?.retval;
  if (!retval) return null;
  const native = scValToNative(retval) as {
    client: string;
    freelancer: string;
    amount: bigint;
    status: { tag?: string } | number;
  };
  const statusTag =
    typeof native.status === 'number'
      ? (['Funded', 'Released', 'Refunded'][native.status] ?? 'Funded')
      : (native.status?.tag ?? 'Funded');
  return {
    client: native.client,
    freelancer: native.freelancer,
    amount: BigInt(native.amount),
    status: statusTag as EscrowState['status'],
  };
}

export function releaseEscrow(invoiceId: string): Promise<string> {
  return adminInvoke('release', invoiceId);
}

export function refundEscrow(invoiceId: string): Promise<string> {
  return adminInvoke('refund', invoiceId);
}
