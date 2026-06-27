/**
 * Minimal TypeScript reference client for the PayRosa invoice-escrow contract.
 *
 * The production app talks to the contract through `src/server/stellar/escrow.ts`
 * (server-side, with the admin key). This standalone file documents the exact
 * argument encoding for each entrypoint so the contract can be driven from any
 * Node script with `@stellar/stellar-sdk`.
 *
 *   deposit(invoice_ref, client, freelancer, token, amount)
 *   release(invoice_ref, caller) -> i128 (amount paid out)
 *   refund(invoice_ref, caller)  -> i128 (amount returned)
 *   get_escrow(invoice_ref) -> { client, freelancer, token, amount, status }
 */
import { createHash } from 'node:crypto';
import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  nativeToScVal,
  rpc,
  TransactionBuilder,
  type xdr,
} from '@stellar/stellar-sdk';

export const TESTNET = {
  contractId: 'CABRI2VIB5OMWHOTXPGSY473OMSCIYHW4OJB6N2G66IYYO5COUH3233X',
  nativeSac: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

/** Escrow key = sha256(invoice id) as a 32-byte ScVal. */
export function invoiceRefScVal(invoiceId: string): xdr.ScVal {
  return nativeToScVal(createHash('sha256').update(invoiceId, 'utf8').digest(), { type: 'bytes' });
}

export function depositArgs(p: {
  invoiceId: string;
  client: string;
  freelancer: string;
  token: string;
  amount: bigint;
}): xdr.ScVal[] {
  return [
    invoiceRefScVal(p.invoiceId),
    new Address(p.client).toScVal(),
    new Address(p.freelancer).toScVal(),
    new Address(p.token).toScVal(),
    nativeToScVal(p.amount, { type: 'i128' }),
  ];
}

/** Build, simulate, sign (admin) and submit a release/refund. Returns the hash. */
export async function settle(
  method: 'release' | 'refund',
  invoiceId: string,
  adminSecret: string,
  cfg = TESTNET,
): Promise<string> {
  const server = new rpc.Server(cfg.rpcUrl);
  const admin = Keypair.fromSecret(adminSecret);
  const contract = new Contract(cfg.contractId);
  const op = contract.call(method, invoiceRefScVal(invoiceId), new Address(admin.publicKey()).toScVal());
  const source = await server.getAccount(admin.publicKey());
  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: cfg.passphrase })
    .addOperation(op)
    .setTimeout(180)
    .build();
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(admin);
  const sent = await server.sendTransaction(prepared);
  return sent.hash;
}
