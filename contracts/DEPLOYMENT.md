# PayRosa Invoice Escrow — Deployment Record

Deployment record of the `payrosa-escrow` Soroban contract — the testnet
deployment used for development and the Level 5 proof runs, and the mainnet
deployment the live app now runs against (see "Mainnet (live)" below).

## Addresses

| Item | Value |
|---|---|
| **Contract ID** | `CABRI2VIB5OMWHOTXPGSY473OMSCIYHW4OJB6N2G66IYYO5COUH3233X` |
| Wasm hash | `a8e2d6704f7572e7589f9edaba4fdf18b7445db4c6e9b9731be8e65d96ba07a7` |
| Admin (deployer) | `GBL5RJKF4QNJ4ZPLJZ7PS7K5A4J44VEZJRV2CRTFFDRVSY2N76AIIE47` |
| Native XLM SAC (token) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Network | Test SDF Network ; September 2015 |
| RPC | https://soroban-testnet.stellar.org |
| Wasm size | 13,359 bytes (optimized) |

Explorer: https://stellar.expert/explorer/testnet/contract/CABRI2VIB5OMWHOTXPGSY473OMSCIYHW4OJB6N2G66IYYO5COUH3233X

## On-chain proof (end-to-end, native XLM, no trustline)

| Step | Tx |
|---|---|
| Upload Wasm | [`1a4f577d…`](https://stellar.expert/explorer/testnet/tx/1a4f577d40b9d35435a55a5603ea9a0aae3e6c763fccd8ebb21fcaa8b2c4f52e) |
| `initialize(admin)` | [`8e8bdff5…`](https://stellar.expert/explorer/testnet/tx/8e8bdff542d3b876576bf8b1589d16aa4fcd4a1335226a8fe9b86adbfc2c4c23) |
| `deposit` (0.1 XLM into escrow) | [`85ed9624…`](https://stellar.expert/explorer/testnet/tx/85ed9624c030d9a437a3faa3aca13ea5625c09d09ba51c829110bd0d52a30fe4) |
| `release` (instant payout to freelancer) | [`7fd82f26…`](https://stellar.expert/explorer/testnet/tx/7fd82f2602116dcda315983b605e3cc531271ed79c12aba41a455f2231ab1179) |

After release, `get_escrow(ref)` returns `status: 1 (Released)`, `amount: 1000000` — the
escrow custodied 0.1 XLM and paid it out exactly once.

## Toolchain

- Rust **1.89.0** (`rustup`, pinned in `rust-toolchain.toml`), target `wasm32-unknown-unknown`.
- Stellar CLI **27.0.0**.
- `soroban-sdk 22.0.0`.

## Reproduce

```bash
cd contracts
cargo +1.89.0 test                 # 12/12 pass
make optimize                      # build + optimize wasm
./scripts/deploy.sh                # deploy + initialize (identity: deployer)
```

## Lifecycle

1. `deposit(invoice_ref, client, freelancer, token, amount)` — client funds the invoice into
   the contract (auth: client). Native XLM is the default asset (no trustline).
2. `release(invoice_ref, caller)` — pay the freelancer (auth: admin or client). Instant payout.
3. `refund(invoice_ref, caller)` — return the deposit to the client if cancelled before release.

`invoice_ref` is `sha256(PayRosa invoice id)`, so the app addresses escrows directly.

## Mainnet (live)

Live deployment of the same `payrosa-escrow` contract on **Stellar Public Network**.

| Item | Value |
|---|---|
| **Contract ID** | `CBSA2NVG7LYW3KPL2PU7EUTFWX2DYAXK67JVPHWONQXPZF4BFEYT4YTZ` |
| Network passphrase | `Public Global Stellar Network ; September 2015` |

Explorer: https://stellar.expert/explorer/public/contract/CBSA2NVG7LYW3KPL2PU7EUTFWX2DYAXK67JVPHWONQXPZF4BFEYT4YTZ

Full deploy-tx history (upload/initialize tx hashes, wasm hash, deployer
identity) wasn't recorded at the time and isn't reconstructed here — see the
testnet "On-chain proof" section above for what a recorded deploy trail looks
like.

## Upgrade / mainnet

- Upgradeable (`upgrade(wasm_hash)`, admin-gated) — ship fixes without losing escrow state.
- For mainnet: `NETWORK=mainnet IDENTITY=prod ./scripts/deploy.sh`, then point the app's
  `SOROBAN_ESCROW_CONTRACT_ID` at the new id.
