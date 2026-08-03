use soroban_sdk::{contracttype, Address};

/// Lifecycle of an invoice escrow. An escrow is created `Funded` when the client
/// deposits; it becomes `Released` once the freelancer is paid out, or
/// `Refunded` if the client reclaims the deposit before release.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EscrowStatus {
    Funded = 0,
    Released = 1,
    Refunded = 2,
}

/// A single invoice escrow. The contract custodies `amount` of `token` between
/// `deposit` (client funds it) and the terminal `release` (pay the freelancer)
/// or `refund` (return to the client). Funds can only ever move to one of those
/// two pre-committed addresses — the admin can choose *when*, never *where*.
#[contracttype]
#[derive(Clone)]
pub struct Escrow {
    /// Funder; the address the deposit is pulled from and a refund returns to.
    pub client: Address,
    /// Beneficiary; the only address a release can pay.
    pub freelancer: Address,
    /// Stellar Asset Contract (SAC) address of the escrowed asset (native XLM by default).
    pub token: Address,
    /// Escrowed amount in the token's minor units (stroops for XLM; 7 decimals).
    pub amount: i128,
    pub status: EscrowStatus,
}
