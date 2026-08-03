use soroban_sdk::{contracttype, BytesN};

/// Storage keys. `Escrow` rows live in *persistent* storage (they must outlive
/// the contract instance), while `Admin`/`Paused`/`Counter` share the instance
/// TTL. An escrow is keyed by a 32-byte invoice reference (sha256 of the app's
/// invoice id) so the app never has to round-trip a contract-assigned id.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Paused,
    Counter,
    /// invoice_ref -> Escrow
    Escrow(BytesN<32>),
}

// Soroban ledgers close ~every 5s -> 17,280 ledgers/day.
pub const DAY_IN_LEDGERS: u32 = 17_280;

// Keep the instance (admin/config) alive ~30 days, re-bumped on every write.
pub const INSTANCE_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
pub const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;

// Escrow rows are bumped to ~60 days so funds can never be stranded by entry
// expiry before a release or refund settles them.
pub const ESCROW_BUMP_AMOUNT: u32 = 60 * DAY_IN_LEDGERS;
pub const ESCROW_LIFETIME_THRESHOLD: u32 = ESCROW_BUMP_AMOUNT - DAY_IN_LEDGERS;
