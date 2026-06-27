use soroban_sdk::contracterror;

/// Every failure mode is an explicit, contiguous `u32` so the TypeScript client
/// can map a contract error straight to a user-facing message without guessing.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotAuthorized = 3,
    Paused = 4,
    InvalidAmount = 5,
    EscrowExists = 6,
    EscrowNotFound = 7,
    EscrowNotFunded = 8,
}
