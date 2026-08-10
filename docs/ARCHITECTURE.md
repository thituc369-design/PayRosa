PAYROSA ARCHITECTURE

PayRosa is pay-by-link invoicing for freelancers settled on Stellar, with funds
held by an on-chain Soroban escrow contract during the window between client
deposit and freelancer release.


STACK

1. Frontend — Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4,
   Radix primitives, sonner toasts, framer-motion, next-intl for locale stubs,
   zod for client validation, qrcode for SEP-7 QR rendering. All wallet pages
   are client components that talk to Freighter via the postMessage bridge in
   app/lib/wallet.ts.

2. Backend — Next.js route handlers under app/api/. Every handler validates
   input with zod, parses the session cookie, calls a service in
   src/server/service/, and serializes results through the ok/created/fail
   envelope in src/server/lib/http.ts. Errors funnel through fromError so the
   client always sees a consistent shape.

3. Database — Drizzle ORM over node-postgres pg.Pool, pointing at Supabase
   Postgres. Schema lives in src/server/db/schema/ and is pushed with
   pnpm run db:push (drizzle-kit). Migrations are emitted to drizzle/.

4. Blockchain — Stellar testnet only. Horizon at
   https://horizon-testnet.stellar.org for account lookups, transaction
   submission, and SSE payment streams. Soroban RPC at
   https://soroban-testnet.stellar.org for simulate, assemble, send, and
   getTransaction against the payrosa-escrow contract. Contract ID
   CABRI2VIB5OMWHOTXPGSY473OMSCIYHW4OJB6N2G66IYYO5COUH3233X, native XLM SAC id
   CDLZFC3SYJYDZT7K67VZ75ZHPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC.

5. Wallet — Freighter v6.0.1 (postMessage API). Network passphrase is pinned to
   testnet on every sign call so a Mainnet wallet still works. Network pin
   lives in app/lib/stellar.ts; Freighter bridge in app/lib/wallet.ts.


DIRECTORY LAYOUT

1. app/ — Next.js App Router pages and route handlers. Root layout in
   app/layout.tsx. Public landing at app/page.tsx. Wallet flow at
   app/connect/page.tsx. Dashboard at app/dashboard/* (invoices list, new,
   detail, cashout). Public pay page under app/(public)/pay/[id]/ with the
   PayWidget client component. Server-Sent Events endpoint at
   app/api/stream/route.ts.

2. app/api/ — Route handlers. Auth under app/api/auth/ (challenge, verify,
   logout, me). Invoices under app/api/invoices/ (list+create, get single,
   pay/prepare, pay). Payouts under app/api/payouts/ (list+send). Profile under
   app/api/profile/ (get+upsert). Public stats at app/api/stats/.

3. src/server/controller/ — HTTP request handlers that bind a NextRequest to a
   service. auth.controller.ts owns the SEP-10 challenge/verify lifecycle, the
   me() session probe, and the logout handler.

4. src/server/service/ — Business logic, the only layer that mutates the
   database. auth.service.ts owns nonce issuance, signature verification, and
   session rows. freelancer.service.ts owns profile get-or-create and update.
   invoice.service.ts owns create/list/get/settle/cancel, plus SEP-7 URI
   generation. payout.service.ts owns send+list with Horizon submit. stats.service.ts
   owns the public usage counter.

5. src/server/stellar/ — Stellar SDK helpers. escrow.ts builds the unsigned
   deposit XDR, submits client-signed deposits, reads escrow state, and
   admin-signs release/refund. payment.ts inspects and submits Horizon payment
   transactions, with op_no_trust and op_underfunded remapping. stream.ts runs
   a manual SSE client against Horizon payments and falls back to polling.
   tx.ts fetches transactions and balances from Horizon. network.ts resolves
   passphrase, Horizon URL, USDC asset.

6. src/server/db/ — Drizzle schema and pool. client.ts holds a singleton
   node-postgres Pool (reused across HMR via globalThis). schema/ holds one
   file per table plus index.ts barrel.

7. src/server/lib/ — Cross-cutting helpers. http.ts owns AppError, ApiEnvelope,
   ok/created/fail/fromError. cookies.ts sets, reads, and clears the
   payrosa_session cookie. logger.ts emits structured JSON to stdout.
   eventBus.ts is the in-process typed pub/sub for SSE fan-out.

8. contracts/ — Soroban smart contract. contracts/payrosa-escrow/ is a Rust
   crate built with soroban-sdk 22 and rust-toolchain 1.89.0. Module layout
   is lib.rs (entrypoints), storage.rs (DataKey, TTL bumps), types.rs
   (Escrow, EscrowStatus), error.rs, test.rs (12 unit tests). Makefile drives
   build and optimize. contracts/scripts/deploy.sh deploys to testnet.
   contracts/ts-client/payrosa-escrow-client.ts is the generated Method
   object used by integration tests. contracts/DEPLOYMENT.md records the live
   contract id, admin address, and SAC token address.

9. tests/ — Vitest unit tests under tests/unit/ (auth.service, invoice.service,
   lib, services). Playwright e2e under tests/e2e/:
   tests/e2e/prod-real.spec.ts drives a full connect → invoice → escrow pay
   cycle against the live testnet deployment via a real Freighter extension
   popup. tests/e2e/demo-video.spec.ts records the demo walkthrough.
   playwright.freighter.config.ts points the run at the live deploy.

10. drizzle/ — Generated SQL migrations from drizzle-kit push. The 0000 snapshot
    is committed; subsequent pushes append numbered files.

11. docs/ — Hackathon artifacts in plain text (SUBMISSION, design, technical-flow,
    description) plus this ARCHITECTURE document.

12. scripts/, screen-shot/ — Helper scripts and the six required JPEG
    screenshots referenced from README.md.


DATA MODEL

The database has five tables. Each freelancer row is provisioned lazily on
first wallet connect.

1. freelancers
   1. id (uuid, primary key, default random)
   2. public_key (text, unique, indexed)
   3. display_name (text, defaults to truncated wallet on first connect)
   4. email (text, nullable, set later from the profile form)
   5. wallet_address (text, defaults to the Stellar public key)
   6. created_at (timestamp with time zone, default now)
   7. updated_at (timestamp with time zone, default now)

2. sessions
   1. id (uuid, primary key, default random)
   2. public_key (text, indexed lookups by cookie id)
   3. created_at (timestamp with time zone, default now)
   4. expires_at (timestamp with time zone, seven day TTL)

3. auth_nonces
   1. nonce (text, primary key)
   2. public_key (text)
   3. expires_at (timestamp with time zone)
   4. consumed_at (timestamp with time zone, nullable — single use)

4. freelancer_invoices
   1. id (uuid, primary key, default random)
   2. freelancer_id (uuid, foreign key to freelancers.id with cascade delete, indexed)
   3. client_name (text)
   4. client_email (text, nullable)
   5. description (text)
   6. amount (text, decimal up to 7 digits, e.g. "12.5")
   7. asset (enum XLM|USDC, default XLM, indexed via status index)
   8. status (enum pending|paid|cancelled, default pending, indexed)
   9. memo (text, 28 char Stellar payment memo, derived from client_name)
   10. tx_hash (text, nullable, the release/payout tx hash)
   11. deposit_tx_hash (text, nullable, the escrow deposit or refund hash)
   12. payer_public_key (text, nullable, the wallet that funded the escrow)
   13. paid_at (timestamp with time zone, nullable)
   14. version (integer, optimistic concurrency counter)
   15. created_at, updated_at (timestamps with time zone)

5. payouts
   1. id (uuid, primary key, default random)
   2. freelancer_id (uuid, foreign key to freelancers.id with cascade delete, indexed)
   3. amount (text, decimal)
   4. asset (enum XLM|USDC, default XLM)
   5. destination (text, the Stellar address funds were sent to)
   6. tx_hash (text, the confirmed Horizon hash)
   7. status (enum completed|failed, default completed, indexed)
   8. created_at, updated_at (timestamps with time zone)


STELLAR INTEGRATION

PayRosa uses four Stellar features end to end.

1. SEP-10 style wallet authentication. The server builds an unsigned
   TransactionBuilder envelope that embeds a 24-byte base64url nonce inside a
   ManageData operation named auth_nonce. The transaction is never submitted
   to the network; it is signed by the wallet and returned. auth.service.ts
   verifies the signature against sha256(network_passphrase + tx_envelope) and
   confirms the nonce matches an unconsumed auth_nonces row. A sessions row is
   then inserted and its id is set as the payrosa_session HttpOnly cookie.

2. SEP-7 payment URI. Each invoice generates a web+stellar:pay URI through
   buildSep7Uri() in invoice.service.ts. The URI carries destination, amount,
   asset_code and asset_issuer when the asset is USDC, plus memo and
   memo_type=text. The QR code is rendered on the share page so a client can
   scan and pay from any SEP-7 compatible wallet.

3. Soroban contract invoke. The escrow contract is invoked through three paths
   on the server. buildDepositXdr() simulates and assembles an unsigned deposit
   for the client to sign. releaseEscrow() and refundEscrow() admin-sign and
   submit settle calls. getEscrowState() simulates the get_escrow view to
   confirm a deposit actually landed and to verify the beneficiary matches
   the invoice before the server triggers release.

4. Horizon payment ops and polling. Payouts are regular Stellar payment
   operations submitted to Horizon over POST /transactions. /api/stream runs
   a manual SSE client against /accounts/{wallet}/payments so the dashboard
   shows new deposits live. stats.service.ts runs the public counter off the
   payouts and invoices tables.


SOROBAN CONTRACT ENTRY POINTS

The payrosa-escrow contract is written in Rust against soroban-sdk 22 and
deployed on Stellar testnet. Storage uses instance keys for admin and pause
state plus persistent entries keyed by sha256(invoice_id) for each escrow.

1. initialize(admin) — one-time admin setup. Records the deployer and unpauses.
   Callable only when no admin is set.

2. deposit(invoice_ref, client, freelancer, token, amount) — locks the amount
   into the contract's custody via the Stellar Asset Contract transfer. Auth:
   client.require_auth(). Status set to Funded. Emits a deposit event with the
   client and amount.

3. release(invoice_ref, caller) — pays the freelancer the full amount from
   the contract's balance. Auth: caller.require_auth() plus caller must be the
   admin or the escrow's own client. Status set to Released.

4. refund(invoice_ref, caller) — returns the deposit to the client. Auth:
   caller.require_auth() plus caller must be the admin or the escrow's own
   client. Status set to Refunded.

5. get_escrow(invoice_ref) — view returning the Escrow struct or
   EscrowNotFound. Used by getEscrowState() on the server.

6. has_escrow, total_escrows, is_paused, get_admin — read-only views.

7. pause, unpause, set_admin, upgrade — admin-only operational controls.
   upgrade replaces the contract wasm via deployer.update_current_contract_wasm.


KEY FLOWS

1. Connect wallet
   1. User opens app/connect/page.tsx and taps Connect. The page calls
      connectWallet() in app/lib/wallet.ts which dynamically imports
      @stellar/freighter-api, runs isConnected(), and on success calls
      requestAccess() to surface the Freighter approval popup.
   2. The page POSTs the returned public key to /api/auth/challenge.
      auth.controller.requestChallenge validates it, auth.service.createChallenge
      issues a 24-byte nonce, builds an unsigned TransactionBuilder envelope
      with the nonce in a ManageData op, inserts an auth_nonces row with TTL,
      and returns the tx XDR plus the nonce.
   3. The page calls signXdr(txXdr, publicKey). Freighter returns the signed
      envelope (with the network pinned to testnet).
   4. The page POSTs the signed XDR to /api/auth/verify.
      auth.service.verifyAndCreateSession parses the signed envelope, verifies
      the ed25519 signature, extracts the nonce from the ManageData op,
      confirms the nonce row is unconsumed and unexpired, marks it consumed,
      inserts a sessions row, and returns the session id.
   5. setSessionCookie() writes payrosa_session=<sessionId>; HttpOnly;
      SameSite=Lax; Max-Age=604800. freelancerService.getOrCreate() then
      provisions a freelancers row keyed by the public key with a truncated
      display name like GBL5...IIE47.
   6. /api/auth/me reads the cookie on every subsequent request and returns
      the public key. Page redirects to /dashboard.

2. Create and share an invoice
   1. Freelancer opens app/dashboard/invoices/new and fills in client name,
      description, amount, and asset. XLM is pre-selected.
   2. POST /api/invoices with the JSON body. The route validates with zod
      (regex on amount, refine greater than zero, enum asset). invoiceService.create
      looks up the freelancer by publicKey from the session, derives a memo
      from clientName (alphanumeric, max 28 chars), inserts a
      freelancer_invoices row with status=pending, and returns the new invoice.
   3. The dashboard renders the new invoice with a shareable URL /pay/{id} and
      a SEP-7 QR code. /api/invoices/{id} also returns a SEP-7 URI built from
      freelancer.walletAddress, amount, asset, and memo.

3. Client pays through escrow (the core action)
   1. Client opens app/(public)/pay/[id] which is a public page that loads
      the invoice via /api/invoices/{id} and renders the PayWidget.
   2. PayWidget.ensurePayer() runs connectWallet() to surface Freighter and
      capture the payer address. If the asset is USDC, PayWidget checks
      hasUsdcTrustline(payer); if missing, it offers a one-tap Enable USDC
      button that builds, signs, and submits a changeTrust op via Horizon.
   3. POST /api/invoices/{id}/pay/prepare with { payer }. The route loads
      the invoice and freelancer, then buildDepositXdr() simulates the
      deposit call against the contract, assembles the transaction with the
      Soroban resource fee, and returns the unsigned XDR.
   4. PayWidget calls signXdr() on the deposit. The client signs once.
   5. POST /api/invoices/{id}/pay with { signedXdr }. invoiceService.settle
      submits the deposit, calls getEscrowState to confirm Funded and that the
      beneficiary matches the freelancer's wallet, then admin-signs and
      submits releaseEscrow(). Two real on-chain transactions, two real hashes.
   6. The invoice row flips to status=paid, deposit_tx_hash and tx_hash are
      recorded, paid_at is set, version increments under optimistic
      concurrency, and PayWidget renders the explorer link to the release
      hash.

4. Cancel a funded invoice
   1. Freelancer cancels from app/dashboard/invoices/[id]. POST /api/invoices/{id}
      routes to invoiceService.cancel.
   2. If getEscrowState shows Funded, the server admin-signs and submits
      refundEscrow() to return the deposit to the client on-chain. The refund
      hash is stored in deposit_tx_hash.
   3. Status flips to cancelled. Funds are never stuck because the contract
      can only ever route an escrow to the recorded freelancer or back to the
      recorded client.

5. Payout to an external address
   1. Freelancer opens app/dashboard/cashout, picks a destination Stellar
      address, amount, and asset. buildPaymentXdr() in app/lib/stellar.ts
      builds an unsigned Horizon payment op (XLM native or USDC issued).
   2. The freelancer signs with Freighter. POST /api/payouts submits to
      payoutService.send which inspects the XDR, asserts the source matches
      the freelancer's walletAddress, submits to Horizon, and inserts a
      payouts row with the confirmed tx hash.

6. Stats
   1. GET /api/stats is a public route. statsService.usage runs six aggregate
      queries against the database: distinct public keys in sessions, session
      count, freelancer count, invoice count, paid invoice count, payout
      count, plus a sum by asset for paid invoices.
   2. A hardcoded DEMO_KEYS array filters out the wallet used for seeding so
      /stats reflects only real users and real flows.
   3. app/stats/page.tsx renders the result as a public dashboard card.


ENVIRONMENT VARIABLES

All env vars are validated through zod in src/server/config/env.ts. Missing
secrets fail at boot.

1. NODE_ENV — development | test | production
2. NEXT_PUBLIC_APP_NAME — display name, defaults to PayRosa
3. NEXT_PUBLIC_APP_URL — public origin, used for share links
4. DRIZZLE_DATABASE_URL — Postgres connection string (Supabase)
5. STELLAR_NETWORK — testnet | public | futurenet
6. STELLAR_HORIZON_URL — Horizon base URL
7. STELLAR_NETWORK_PASSPHRASE — override passphrase for custom networks
8. SOROBAN_RPC_URL — Soroban RPC base URL
9. SOROBAN_ESCROW_CONTRACT_ID — deployed payrosa-escrow contract id
10. NATIVE_SAC_ID — Stellar Asset Contract id of native XLM
11. ESCROW_ADMIN_SECRET — admin (deployer) secret key, server side only,
    used to sign release and refund
12. SESSION_SECRET — at least 32 chars, used for cookie integrity
13. SESSION_COOKIE_NAME — defaults to payrosa_session
14. SESSION_TTL_SECONDS — defaults to 604800 (seven days)
15. NONCE_TTL_SECONDS — defaults to 300 (five minutes)
16. USDC_ASSET_CODE — defaults to USDC
17. USDC_ASSET_ISSUER_TESTNET — USDC issuer on testnet
18. USDC_ASSET_ISSUER_PUBLIC — USDC issuer on public
19. NEXT_PUBLIC_STELLAR_NETWORK — mirrors STELLAR_NETWORK for the client
20. NEXT_PUBLIC_STELLAR_HORIZON_URL — mirrors STELLAR_HORIZON_URL for the client
21. NEXT_PUBLIC_USDC_CODE — mirrors USDC_ASSET_CODE for the client
22. NEXT_PUBLIC_USDC_ISSUER — mirrors USDC_ASSET_ISSUER_TESTNET for the client

Secrets are referenced by name only. The actual ESCROW_ADMIN_SECRET and
SESSION_SECRET values are not committed to this repository.


DEPLOY

1. Vercel project — payrosa under the team scope; production URL is
   https://payrosa.vercel.app. Preview deployments are produced for every
   pull request.

2. Database — Supabase Postgres, instance shared by all four agent slots per
   the workspace convention (DATABASE_URL per agent slot a/b/c/d on port 5432
   of localhost, postgres user, password held in env).

3. Key URLs
   1. App — https://payrosa.vercel.app
   2. Stats page — https://payrosa.vercel.app/stats
   3. Connect — https://payrosa.vercel.app/connect
   4. Public pay link example — https://payrosa.vercel.app/pay/{invoiceId}
   5. Horizon — https://horizon-testnet.stellar.org
   6. Soroban RPC — https://soroban-testnet.stellar.org
   7. Escrow explorer — https://stellar.expert/explorer/testnet/contract/CABRI2VIB5OMWHOTXPGSY473OMSCIYHW4OJB6N2G66IYYO5COUH3233X


LIMITATIONS AND KNOWN GAPS

1. The Soroban RPC public pool is eventually consistent. Deposit confirmations
   and the subsequent getEscrowState reads can briefly miss a just-ledgered
   escrow on a lagging node. escrow.ts retries up to six times with a two
   second sleep before failing. A few settlements in heavy load windows may
   still surface EscrowNotFound; the page retries from the client side.

2. The sendAndConfirm loop re-submits the same idempotent transaction every
   fourth poll to recover from testnet mempool drops. This is fine for
   envelope-level idempotence but is not a substitute for a fee bump.

3. Public mainnet (L6) deploy is not done. The contract supports
   pause/unpause/upgrade so the same code can ship to public with a key
   rotation and a USDC issuer swap, but it has not been published to
   https://horizon.stellar.org yet.

4. There is no KYC or sanctions screening. The escrow contract is
   trust-minimized between client and freelancer; PayRosa is not a regulated
   anchor and the testnet deploy does not handle real money.

5. The payouts table only records completed transfers. Failed Horizon
   submissions throw AppError but do not persist a row, so /stats can
   undercount attempted payouts by the failure rate.

6. The /api/stream endpoint polls Horizon every five seconds per open SSE
   connection. At scale this multiplies quickly; the intended migration is to
   push payment events through Postgres LISTEN/NOTIFY rather than per-client
   polling.

7. eventBus is in-process only. A multi-instance deploy would need Redis
   pub/sub or LISTEN/NOTIFY to fan out invoice updates across pods.

8. The dashboard renders USDC enablement as a one-tap flow, but the actual
   trustline change is built in app/lib/stellar.ts and submitted through
   Horizon rather than through the escrow contract. Future work: move
   trustline creation into a Soroban admin helper so the entire flow uses
   Soroban RPC only.

9. The Memo is derived by stripping non-alphanumeric characters from the
   client name and truncating to 28 chars, with a fallback of PayRosa.
   Duplicate names collide on the memo; uniqueness is on invoice id, not
   memo, so this is safe but can confuse a payer reviewing their wallet
   history.

10. Stats exclude one seeded wallet (DEMO_KEYS) so demo traffic does not
    inflate public counters. This is a hardcoded list, not a generic
    exclusion mechanism. A real production deploy should mark demo rows at
    insert time instead of filtering at query time.

11. Rate limiting is not implemented on /api/auth/challenge, /pay/prepare, or
    /pay. A single wallet can request many challenges or deposit preparations
    per second. Acceptable for testnet, not for mainnet.

12. The freelancer session relies on a cookie id stored in the sessions
    table; revoking an active session requires a manual DELETE. There is no
    admin endpoint for session management.
