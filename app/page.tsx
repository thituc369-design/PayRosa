import { ArrowRight, FileText, Link2, ShieldCheck, Wallet, Zap } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-white">
      {/* Header */}
      <header className="border-b border-teal-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-teal-600 flex items-center justify-center">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="font-heading text-xl font-bold text-teal-900">PayRosa</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/stats"
              className="hidden sm:inline-block rounded-lg px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50 transition-colors"
            >
              Network stats
            </Link>
            <Link
              href="/connect"
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
            >
              Open dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-6xl px-6 pt-16 pb-12 sm:pt-24">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-100 px-4 py-2 text-sm font-medium text-teal-700 mb-6">
            <ShieldCheck className="h-3.5 w-3.5" />
            Settled on Stellar testnet — XLM by default, USDC optional
          </div>
          <h1 className="font-heading text-4xl sm:text-5xl font-bold text-teal-900 mb-6 leading-tight">
            Invoice clients.
            <br />
            Get paid in <span className="text-teal-600">seconds</span>.
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            PayRosa turns an invoice into a payment link your client can settle on-chain. Funds
            land directly in your Stellar wallet — no banks, no 30-day waits, no chargebacks.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/connect"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-6 py-3 font-semibold text-white hover:bg-teal-700 transition-colors"
            >
              Connect wallet to start <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/stats"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-teal-200 px-6 py-3 font-semibold text-teal-700 hover:bg-teal-50 transition-colors"
            >
              See live network stats
            </Link>
          </div>
          <p className="mt-4 text-xs text-gray-400">
            Browsing is free — you only need a wallet when it's time to sign.
          </p>
        </div>

        {/* Features */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: FileText,
              title: 'Create an invoice',
              body: 'Set the client, work description, amount and asset. XLM is pre-selected so any funded wallet can pay instantly.',
            },
            {
              icon: Link2,
              title: 'Share the pay link',
              body: 'Every invoice gets a public link and SEP-7 QR. Your client opens it, connects a wallet, and pays in one tap.',
            },
            {
              icon: Wallet,
              title: 'Receive on-chain',
              body: 'The payment settles to your wallet in ~5 seconds with a real transaction hash you can verify on the explorer.',
            },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-teal-100 bg-white p-7">
              <div className="mb-4 h-10 w-10 rounded-xl bg-teal-100 flex items-center justify-center">
                <f.icon className="h-5 w-5 text-teal-600" />
              </div>
              <h3 className="font-heading text-lg font-bold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-teal-100 mt-8">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-500">
          <span className="font-heading font-semibold text-teal-800">PayRosa</span>
          <div className="flex items-center gap-5">
            <Link href="/connect" className="hover:text-teal-700">
              Dashboard
            </Link>
            <Link href="/stats" className="hover:text-teal-700">
              Network stats
            </Link>
            <span className="text-gray-400">Stellar testnet</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
