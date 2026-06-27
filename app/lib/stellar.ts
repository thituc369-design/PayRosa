'use client';

import {
  Asset,
  BASE_FEE,
  Horizon,
  Memo,
  Networks,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

// Network is PINNED to the app's configured Stellar network (testnet), never the
// wallet's active network — every transaction we build & ask Freighter to sign
// uses this passphrase, so connecting works even if the wallet sits on Mainnet.
const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
export const NETWORK_PASSPHRASE = NETWORK === 'public' ? Networks.PUBLIC : Networks.TESTNET;
export const HORIZON_URL =
  process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';

const USDC_CODE = process.env.NEXT_PUBLIC_USDC_CODE ?? 'USDC';
const USDC_ISSUER =
  process.env.NEXT_PUBLIC_USDC_ISSUER ?? 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

export type AssetCode = 'XLM' | 'USDC';

export function usdcAsset(): Asset {
  return new Asset(USDC_CODE, USDC_ISSUER);
}

export function assetFor(code: AssetCode): Asset {
  return code === 'USDC' ? usdcAsset() : Asset.native();
}

function server(): Horizon.Server {
  return new Horizon.Server(HORIZON_URL);
}

export class NotFundedError extends Error {
  constructor(public readonly account: string) {
    super('Account not found on the Stellar network');
    this.name = 'NotFundedError';
  }
}

export class NoTrustlineError extends Error {
  constructor() {
    super('Recipient or payer has no USDC trustline');
    this.name = 'NoTrustlineError';
  }
}

async function loadAccount(account: string): Promise<Horizon.AccountResponse> {
  try {
    return await server().loadAccount(account);
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) throw new NotFundedError(account);
    throw err;
  }
}

/** True if the account holds a trustline for our USDC asset. */
export async function hasUsdcTrustline(account: string): Promise<boolean> {
  try {
    const acct = await loadAccount(account);
    return acct.balances.some(
      (b) =>
        'asset_code' in b &&
        b.asset_code === USDC_CODE &&
        'asset_issuer' in b &&
        b.asset_issuer === USDC_ISSUER,
    );
  } catch (err) {
    if (err instanceof NotFundedError) return false;
    throw err;
  }
}

/** Native XLM balance as a decimal string ("0" if unfunded). */
export async function xlmBalance(account: string): Promise<string> {
  try {
    const acct = await loadAccount(account);
    const native = acct.balances.find((b) => b.asset_type === 'native');
    return native?.balance ?? '0';
  } catch (err) {
    if (err instanceof NotFundedError) return '0';
    throw err;
  }
}

/** Build an unsigned payment transaction XDR (caller signs with Freighter). */
export async function buildPaymentXdr(params: {
  source: string;
  destination: string;
  asset: AssetCode;
  amount: string;
  memo?: string | null;
}): Promise<string> {
  const account = await loadAccount(params.source);
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  }).addOperation(
    Operation.payment({
      destination: params.destination,
      asset: assetFor(params.asset),
      amount: params.amount,
    }),
  );
  if (params.memo) builder.addMemo(Memo.text(params.memo.slice(0, 28)));
  return builder.setTimeout(180).build().toXDR();
}

/** Build an unsigned changeTrust(USDC) transaction XDR. */
export async function buildTrustlineXdr(source: string): Promise<string> {
  const account = await loadAccount(source);
  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset: usdcAsset() }))
    .setTimeout(180)
    .build()
    .toXDR();
}

/** Submit a signed XDR to Horizon and return the confirmed transaction hash. */
export async function submitXdr(signedXdr: string): Promise<string> {
  const tx = new Transaction(signedXdr, NETWORK_PASSPHRASE);
  const res = await server().submitTransaction(tx);
  return res.hash;
}

export function StrKeyValid(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address);
}

export function explorerTxUrl(hash: string): string {
  const net = NETWORK === 'public' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${net}/tx/${hash}`;
}
