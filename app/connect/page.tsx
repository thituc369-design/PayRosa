'use client';

import { ArrowLeft, Loader2, ShieldCheck, Wallet, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { connectWallet, signXdr } from '@/app/lib/wallet';

export default function ConnectPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onConnect = async () => {
    setBusy(true);
    try {
      const pk = await connectWallet();

      // SEP-10 style: server issues a challenge tx, wallet signs it (network
      // pinned to testnet), server verifies the signature and opens a session.
      const challengeRes = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: pk }),
      });
      if (!challengeRes.ok) throw new Error('Could not start the challenge');
      const challengeJson = await challengeRes.json();
      const txXdr: string | undefined = challengeJson.data?.txXdr ?? challengeJson.txXdr;
      if (!txXdr) throw new Error('Challenge transaction missing');

      const signedTx = await signXdr(txXdr, pk);

      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: pk, signedNonce: signedTx }),
      });
      if (!verifyRes.ok) throw new Error('Verification failed');

      toast.success('Wallet connected');
      router.push('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Connection failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
        <div className="rounded-2xl border border-teal-100 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-teal-600 flex items-center justify-center">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-heading text-xl font-bold text-gray-900">Connect your wallet</h1>
              <p className="text-sm text-gray-500">PayRosa uses Stellar Freighter</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-6">
            Connect to open your invoicing dashboard. We never hold your keys — you sign a one-time
            challenge to prove ownership.
          </p>
          <button
            type="button"
            onClick={onConnect}
            disabled={busy}
            data-testid="connect-wallet"
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-teal-600 px-4 py-3 font-semibold text-white hover:bg-teal-700 disabled:opacity-60 transition-colors"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wallet className="h-5 w-5" />}
            {busy ? 'Waiting for signature…' : 'Connect with Freighter'}
          </button>

          <div className="mt-5 flex items-start gap-2 rounded-lg bg-teal-50 border border-teal-100 p-3">
            <ShieldCheck className="h-4 w-4 text-teal-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-teal-700">
              Signing is pinned to Stellar <strong>testnet</strong>. Connecting works even if your
              wallet is set to Mainnet.
            </p>
          </div>

          <p className="mt-4 text-xs text-center text-gray-500">
            Don't have Freighter?{' '}
            <a
              href="https://www.freighter.app/"
              target="_blank"
              rel="noreferrer"
              className="text-teal-600 hover:underline"
            >
              Install it free
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
