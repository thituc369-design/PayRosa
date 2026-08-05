import { TransactionBuilder } from '@stellar/stellar-sdk';
import { AppError } from '@/server/lib/http';
import { getHorizonUrl, getNetworkPassphrase, usdcCode, usdcIssuer } from './network';

export type PaymentDetails = {
  source: string;
  destination: string;
  assetCode: 'XLM' | 'USDC';
  amount: string;
};

/**
 * Parse a signed payment transaction and pull out the single payment op so the
 * server can verify it matches the invoice BEFORE submitting it to the network.
 */
export function inspectPayment(signedXdr: string): PaymentDetails {
  let tx: ReturnType<typeof TransactionBuilder.fromXDR>;
  try {
    tx = TransactionBuilder.fromXDR(signedXdr, getNetworkPassphrase());
  } catch {
    throw new AppError('INVALID_INPUT', 'Could not parse signed transaction', 400);
  }
  if (!('operations' in tx)) {
    throw new AppError('INVALID_INPUT', 'Fee-bump transactions are not supported', 400);
  }
  const op = tx.operations.find((o) => o.type === 'payment') as
    | {
        type: 'payment';
        destination: string;
        amount: string;
        asset: { isNative(): boolean; code?: string; issuer?: string };
      }
    | undefined;
  if (!op) throw new AppError('INVALID_INPUT', 'Transaction has no payment operation', 400);

  const source = 'source' in tx && tx.source ? tx.source : '';
  if (op.asset.isNative()) {
    return { source, destination: op.destination, assetCode: 'XLM', amount: op.amount };
  }
  if (op.asset.code === usdcCode() && op.asset.issuer === usdcIssuer()) {
    return { source, destination: op.destination, assetCode: 'USDC', amount: op.amount };
  }
  throw new AppError('INVALID_INPUT', 'Unsupported payment asset', 400);
}

/** Submit a signed XDR to Horizon. Returns the hash on success. */
export async function submitSignedTx(signedXdr: string): Promise<string> {
  const url = `${getHorizonUrl().replace(/\/$/, '')}/transactions`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `tx=${encodeURIComponent(signedXdr)}`,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new AppError('INTERNAL', `Horizon submit failed: ${String(err)}`, 502);
  }
  const json = (await res.json().catch(() => ({}))) as {
    hash?: string;
    successful?: boolean;
    extras?: { result_codes?: { transaction?: string; operations?: string[] } };
  };
  if (!res.ok || !json.hash || json.successful === false) {
    const codes = json.extras?.result_codes;
    const detail =
      codes?.operations?.join(',') || codes?.transaction || `Horizon ${res.status}`;
    // Surface the common "no trustline" case with a clear, actionable code.
    if (detail.includes('op_no_trust')) {
      throw new AppError(
        'INVALID_INPUT',
        'Recipient has no trustline for this asset. Pay in XLM or ask them to enable USDC.',
        400,
      );
    }
    if (detail.includes('underfunded') || detail.includes('op_underfunded')) {
      throw new AppError('INVALID_INPUT', 'Insufficient balance to cover this payment.', 400);
    }
    throw new AppError('INTERNAL', `Payment rejected by network: ${detail}`, 400);
  }
  return json.hash;
}

/** Numeric equality tolerant of trailing-zero formatting differences. */
export function amountEquals(a: string, b: string): boolean {
  return Math.abs(Number(a) - Number(b)) < 1e-7;
}
