#![no_std]
//! # PayRosa Invoice Escrow
//!
//! A Soroban smart contract that escrows a freelancer's invoice payment so the
//! client and the freelancer never have to trust each other or PayRosa.
//!
//! The lifecycle mirrors how PayRosa settles an invoice:
//!
//! 1. **deposit** — the client locks the invoice amount *into the contract*.
//!    The money leaves the client's wallet but does not reach the freelancer
//!    yet; it is held in the contract's own custody.
//! 2. **release** — on accept/approve, the contract pays the freelancer the full
//!    amount (the "instant payout"). Funds can only go to the freelancer named
//!    at deposit time.
//! 3. **refund** — if the engagement is cancelled before release, the deposit is
//!    returned to the client. Funds are never stuck and never mis-routed.
//!
//! ## Design notes
//! - **Token escrow via the Stellar Asset Contract (SAC).** Default asset is
//!   native XLM (no trustline needed); any SAC asset (e.g. USDC) also works.
//! - **Invoice-keyed.** Each escrow is keyed by a 32-byte `invoice_ref`
//!   (sha256 of PayRosa's invoice id) so the app addresses escrows directly,
//!   with no contract-assigned counter to track.
//! - **Authorization.** `deposit` requires the client's signature (which also
//!   authorizes the inner SAC transfer). `release`/`refund` are gated to the
//!   admin (the PayRosa deployer) **or** the escrow's own client, so payout can
//!   be triggered server-side without ever changing the destination.
//! - **Pausable + upgradeable.** Operational safety for a mainnet (L6) deploy.
//! - **Storage TTL management.** Instance and escrow entries are bumped so an
//!   escrow can never expire out from under a pending release/refund.

mod error;
mod storage;
mod types;

#[cfg(test)]
mod test;

pub use error::Error;
use storage::{
    DataKey, ESCROW_BUMP_AMOUNT, ESCROW_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT,
    INSTANCE_LIFETIME_THRESHOLD,
};
pub use types::{Escrow, EscrowStatus};

use soroban_sdk::{contract, contractimpl, symbol_short, token, Address, BytesN, Env};

#[contract]
pub struct PayrosaEscrow;

#[contractimpl]
impl PayrosaEscrow {
    /// One-time setup. Records the admin and unpauses the contract.
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().set(&DataKey::Counter, &0u64);
        bump_instance(&env);
        env.events().publish((symbol_short!("init"),), admin);
        Ok(())
    }

    /// Lock `amount` of `token` for an invoice into the contract's custody.
    ///
    /// Auth: requires the client's signature; the same authorization covers the
    /// inner SAC `transfer(client -> contract)`.
    pub fn deposit(
        env: Env,
        invoice_ref: BytesN<32>,
        client: Address,
        freelancer: Address,
        token: Address,
        amount: i128,
    ) -> Result<(), Error> {
        client.require_auth();
        require_not_paused(&env)?;

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if env.storage().persistent().has(&DataKey::Escrow(invoice_ref.clone())) {
            return Err(Error::EscrowExists);
        }

        // Pull the deposit into the contract's custody.
        token::Client::new(&env, &token).transfer(
            &client,
            &env.current_contract_address(),
            &amount,
        );

        let escrow = Escrow {
            client: client.clone(),
            freelancer,
            token,
            amount,
            status: EscrowStatus::Funded,
        };
        save_escrow(&env, &invoice_ref, &escrow);
        bump_counter(&env);
        bump_instance(&env);

        env.events()
            .publish((symbol_short!("deposit"), invoice_ref), (client, amount));
        Ok(())
    }

    /// Release a funded escrow to the freelancer (the instant payout).
    ///
    /// Auth: the contract admin *or* the escrow's own client may trigger it.
    /// Either way, the only possible destination is the freelancer recorded at
    /// deposit time.
    pub fn release(env: Env, invoice_ref: BytesN<32>, caller: Address) -> Result<i128, Error> {
        caller.require_auth();
        let mut escrow = load_escrow(&env, &invoice_ref)?;
        authorize_settler(&env, &caller, &escrow)?;

        if escrow.status != EscrowStatus::Funded {
            return Err(Error::EscrowNotFunded);
        }

        let amount = escrow.amount;
        token::Client::new(&env, &escrow.token).transfer(
            &env.current_contract_address(),
            &escrow.freelancer,
            &amount,
        );

        escrow.status = EscrowStatus::Released;
        save_escrow(&env, &invoice_ref, &escrow);
        bump_instance(&env);

        env.events()
            .publish((symbol_short!("release"), invoice_ref), (escrow.freelancer, amount));
        Ok(amount)
    }

    /// Refund a funded escrow back to the client (cancel before release).
    ///
    /// Auth: the contract admin *or* the escrow's own client.
    pub fn refund(env: Env, invoice_ref: BytesN<32>, caller: Address) -> Result<i128, Error> {
        caller.require_auth();
        let mut escrow = load_escrow(&env, &invoice_ref)?;
        authorize_settler(&env, &caller, &escrow)?;

        if escrow.status != EscrowStatus::Funded {
            return Err(Error::EscrowNotFunded);
        }

        let amount = escrow.amount;
        token::Client::new(&env, &escrow.token).transfer(
            &env.current_contract_address(),
            &escrow.client,
            &amount,
        );

        escrow.status = EscrowStatus::Refunded;
        save_escrow(&env, &invoice_ref, &escrow);
        bump_instance(&env);

        env.events()
            .publish((symbol_short!("refund"), invoice_ref), (escrow.client, amount));
        Ok(amount)
    }

    // --- Views -------------------------------------------------------------

    pub fn get_escrow(env: Env, invoice_ref: BytesN<32>) -> Result<Escrow, Error> {
        load_escrow(&env, &invoice_ref)
    }

    pub fn has_escrow(env: Env, invoice_ref: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::Escrow(invoice_ref))
    }

    pub fn total_escrows(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Counter).unwrap_or(0u64)
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }

    pub fn get_admin(env: Env) -> Result<Address, Error> {
        env.storage().instance().get(&DataKey::Admin).ok_or(Error::NotInitialized)
    }

    // --- Admin -------------------------------------------------------------

    pub fn pause(env: Env) -> Result<(), Error> {
        admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);
        bump_instance(&env);
        env.events().publish((symbol_short!("pause"),), true);
        Ok(())
    }

    pub fn unpause(env: Env) -> Result<(), Error> {
        admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);
        bump_instance(&env);
        env.events().publish((symbol_short!("pause"),), false);
        Ok(())
    }

    pub fn set_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        bump_instance(&env);
        Ok(())
    }

    /// Replace the contract's own code (admin-gated). Lets PayRosa ship fixes
    /// without migrating escrow state — important for a mainnet (L6) deploy.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        admin(&env)?.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }
}

// --- Internal helpers ------------------------------------------------------

fn admin(env: &Env) -> Result<Address, Error> {
    env.storage().instance().get(&DataKey::Admin).ok_or(Error::NotInitialized)
}

/// A settle (release/refund) is allowed for the contract admin or the escrow's
/// own client. `caller.require_auth()` has already run in the entrypoint.
fn authorize_settler(env: &Env, caller: &Address, escrow: &Escrow) -> Result<(), Error> {
    let admin = admin(env)?;
    if *caller == admin || *caller == escrow.client {
        Ok(())
    } else {
        Err(Error::NotAuthorized)
    }
}

fn require_not_paused(env: &Env) -> Result<(), Error> {
    let paused: bool = env
        .storage()
        .instance()
        .get(&DataKey::Paused)
        .ok_or(Error::NotInitialized)?;
    if paused {
        return Err(Error::Paused);
    }
    Ok(())
}

fn bump_counter(env: &Env) {
    let current: u64 = env.storage().instance().get(&DataKey::Counter).unwrap_or(0u64);
    env.storage().instance().set(&DataKey::Counter, &(current + 1));
}

fn load_escrow(env: &Env, invoice_ref: &BytesN<32>) -> Result<Escrow, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Escrow(invoice_ref.clone()))
        .ok_or(Error::EscrowNotFound)
}

fn save_escrow(env: &Env, invoice_ref: &BytesN<32>, escrow: &Escrow) {
    let key = DataKey::Escrow(invoice_ref.clone());
    env.storage().persistent().set(&key, escrow);
    env.storage()
        .persistent()
        .extend_ttl(&key, ESCROW_LIFETIME_THRESHOLD, ESCROW_BUMP_AMOUNT);
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}
