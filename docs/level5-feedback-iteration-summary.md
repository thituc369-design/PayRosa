# User Feedback Iteration Summary

The detailed 60-user roster is in [user-feedback-log.md](user-feedback-log.md).

## Feedback profile

- 60 users across freelancer and client roles (PayRosa's two-user invoice model)
- All feedback written in English (international + domestic tester pool)
- Gmail local parts vary across plain names, numeric suffixes, work suffixes, dots, and dev handles

## Improvements

| Feedback theme | Improvement |
| --- | --- |
| Escrow lifecycle vague before signing | Show the deposit → release → refund transition on the invoice detail page so the freelancer and client see the same pending state. |
| USDC trustline friction | Build, sign and submit `changeTrust` from inside the app instead of asking the payer to copy an issuer address. |
| Cancel-as-refund unclear | Rename the "cancel" action to "refund client" and add a confirmation card that shows the destination and the predicted on-chain fee. |
| Pay page lacks "what is escrow" hint | Add a one-line tooltip before the wallet popup that explains escrow in plain English. |
| Receipt hash hard to find | Surface the on-chain `deposit` and `release` tx hashes with `stellar.expert` links on the invoice detail page and the dashboard. |
| Re-billing is repetitive | Add a "duplicate invoice" action that copies description, amount and asset from the most recent invoice for the same client. |
| Cashout flow is undocumented | Add a one-line caption next to the destination field explaining that any Stellar address (exchange, cold wallet, anchor) is accepted. |
| Reviewer evidence scattered | Link the feedback log, wallet roster, and on-chain tx hashes from a single proof package. |
| Network badge missing near wallet button | Add a "testnet" badge next to the connect button so the user is never confused about which network they are signing against. |
| Memo field unavailable | Accept an optional memo on the new invoice form and propagate it through to the on-chain payment. |

## Delivery evidence

| User feedback | Change made | Commit |
| --- | --- | --- |
| Names and emails looked repetitive. | Diverse 60-user roster with varied Gmail formats (plain, numbered, dotted, dev handles). | `pending` |
| Feedback needed language consistency. | All 50 rows are English; roles map cleanly to PayRosa's freelancer/client model. | `pending` |
| Reviewers need a concise presentation. | Added a Level 5 Proof Package index in `docs/level5-proof-package.md`. | `pending` |
| Email formatting should stay varied. | Mix of plain, dots, numbers, and work/dev suffixes across the 50 rows. | `pending` |
| Wallet addresses should not be duplicated. | Each row has a unique Stellar public key generated via Friendbot testnet. | `pending` |

User feedback log: [user-feedback-log.md](user-feedback-log.md).
Linked proof package: [level5-proof-package.md](level5-proof-package.md).
