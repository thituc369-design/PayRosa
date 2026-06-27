'use client';

import { CheckCircle, ExternalLink, Loader2, Wallet } from 'lucide-react';
import { useState } from 'react';
import {
  buildTrustlineXdr,
  explorerTxUrl,
  hasUsdcTrustline,
  NoTrustlineError,
  NotFundedError,
  submitXdr,
} from '@/app/lib/stellar';
import { connectWallet, signXdr } from '@/app/lib/wallet';

interface Props {
  invoiceId: string;
  destination: string;
  amount: string;
  asset: 'XLM' | 'USDC';
  memo: string;
}

type Phase = 'idle' | 'connecting' | 'trustline' | 'signing' | 'submitting' | 'paid' | 'error';

function fmt(amount: string): string {
  if (!amount.includes('.')) return amount;
  return amount.replace(/\.?0+$/, '') || '0';
}

export function PayWidget({ invoiceId, amount, asset }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsTrustline, setNeedsTrustline] = useState(false);
  const [payer, setPayer] = useState<string | null>(null);

  async function ensurePayer(): Promise<string> {
    if (payer) return payer;
    setPhase('connecting');
    const pk = await connectWallet();
    setPayer(pk);
    return pk;
  }

  async function enableUsdc() {
    setError(null);
    try {
      const pk = await ensurePayer();
      setPhase('trustline');
      const xdr = await buildTrustlineXdr(pk);
      const signed = await signXdr(xdr, pk);
      await submitXdr(signed);
      setNeedsTrustline(false);
      setPhase('idle');
    } catch (e) {
      handleError(e);
    }
  }

  async function pay() {
    setError(null);
    try {
      const pk = await ensurePayer();

      if (asset === 'USDC') {
        const ok = await hasUsdcTrustline(pk);
        if (!ok) {
          setNeedsTrustline(true);
          setPhase('idle');
          return;
        }
      }

      setPhase('signing');
      // 1. Ask the server to build the escrow `deposit` transaction for this payer.
      const prep = await fetch(`/api/invoices/${invoiceId}/pay/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payer: pk }),
      });
      const prepJson = await prep.json();
      if (!prep.ok)
        throw new Error(prepJson.error?.message ?? prepJson.error ?? 'Could not prepare payment');
      const xdr = prepJson.data?.xdr ?? prepJson.xdr;

      // 2. Sign the deposit with the wallet (locks funds into the escrow contract).
      const signed = await signXdr(xdr, pk);

      // 3. Server submits the deposit and releases the payout to the freelancer.
      setPhase('submitting');
      const res = await fetch(`/api/invoices/${invoiceId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedXdr: signed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? json.error ?? 'Payment failed');

      setTxHash(json.data?.txHash ?? json.txHash ?? null);
      setPhase('paid');
    } catch (e) {
      handleError(e);
    }
  }

  function handleError(e: unknown) {
    if (e instanceof NotFundedError) {
      setError('Your wallet has no testnet XLM. Fund it with the testnet faucet, then try again.');
    } else if (e instanceof NoTrustlineError) {
      setError('A USDC trustline is required. Tap "Enable USDC" first.');
    } else {
      setError(e instanceof Error ? e.message : 'Payment failed');
    }
    setPhase('error');
  }

  if (phase === 'paid') {
    return (
      <div
        data-testid="pay-success"
        className="rounded-lg bg-teal-50 border border-teal-200 p-4 text-center"
      >
        <CheckCircle className="h-8 w-8 text-teal-600 mx-auto mb-2" />
        <p className="font-semibold text-teal-800">Payment complete</p>
        <p className="text-sm text-teal-600 mt-1">
          {fmt(amount)} {asset} settled on Stellar in seconds.
        </p>
        {txHash && (
          <a
            href={explorerTxUrl(txHash)}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-teal-600 underline"
          >
            View transaction <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }

  const busy = phase === 'connecting' || phase === 'signing' || phase === 'submitting' || phase === 'trustline';
  const label =
    phase === 'connecting'
      ? 'Connecting wallet…'
      : phase === 'signing'
        ? 'Confirm in your wallet…'
        : phase === 'submitting'
          ? 'Settling on Stellar…'
          : `Pay ${fmt(amount)} ${asset}`;

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-3">Pay with your Stellar wallet</p>

      {needsTrustline ? (
        <button
          type="button"
          onClick={enableUsdc}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-3 font-semibold text-white hover:bg-amber-600 transition-colors disabled:opacity-70 mb-2"
        >
          {phase === 'trustline' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wallet className="h-4 w-4" />
          )}
          {phase === 'trustline' ? 'Enabling USDC…' : 'Enable USDC to pay'}
        </button>
      ) : (
        <button
          type="button"
          data-testid="pay-button"
          onClick={pay}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-3 font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-70 mb-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          {label}
        </button>
      )}

      <p className="text-xs text-center text-gray-400">
        {asset === 'XLM'
          ? 'XLM is native — any funded wallet can pay, no setup needed.'
          : 'Paying in USDC requires a one-time trustline on your wallet.'}
      </p>

      {error && (
        <p className="mt-3 text-center text-xs text-rose-500" data-testid="pay-error">
          {error}
        </p>
      )}
    </div>
  );
}
