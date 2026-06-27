#![cfg(test)]

use crate::{Error, EscrowStatus, PayrosaEscrow, PayrosaEscrowClient};
use soroban_sdk::{
    testutils::{Address as _, BytesN as _},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env,
};

struct Harness {
    env: Env,
    client: Address,
    freelancer: Address,
    admin: Address,
    token: Address,
    escrow: PayrosaEscrowClient<'static>,
}

fn setup() -> Harness {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    // Register a SAC token (stands in for native XLM / USDC) and fund the client.
    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token = sac.address();
    StellarAssetClient::new(&env, &token).mint(&client, &1_000_000_000);

    let contract_id = env.register(PayrosaEscrow, ());
    let escrow = PayrosaEscrowClient::new(&env, &contract_id);
    escrow.initialize(&admin);

    Harness { env, client, freelancer, admin, token, escrow }
}

fn invoice_ref(env: &Env) -> BytesN<32> {
    BytesN::random(env)
}

#[test]
fn test_initialize_sets_admin() {
    let h = setup();
    assert_eq!(h.escrow.get_admin(), h.admin);
    assert_eq!(h.escrow.is_paused(), false);
    assert_eq!(h.escrow.total_escrows(), 0);
}

#[test]
fn test_initialize_twice_fails() {
    let h = setup();
    let res = h.escrow.try_initialize(&h.admin);
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn test_deposit_locks_funds() {
    let h = setup();
    let token = TokenClient::new(&h.env, &h.token);
    let r = invoice_ref(&h.env);

    h.escrow.deposit(&r, &h.client, &h.freelancer, &h.token, &100_000);

    // Funds left the client and now sit in the contract's custody.
    assert_eq!(token.balance(&h.client), 1_000_000_000 - 100_000);
    assert_eq!(token.balance(&h.escrow.address), 100_000);

    let e = h.escrow.get_escrow(&r);
    assert_eq!(e.status, EscrowStatus::Funded);
    assert_eq!(e.amount, 100_000);
    assert_eq!(e.freelancer, h.freelancer);
    assert_eq!(h.escrow.total_escrows(), 1);
}

#[test]
fn test_release_pays_freelancer() {
    let h = setup();
    let token = TokenClient::new(&h.env, &h.token);
    let r = invoice_ref(&h.env);

    h.escrow.deposit(&r, &h.client, &h.freelancer, &h.token, &250_000);
    // Admin triggers the instant payout.
    let paid = h.escrow.release(&r, &h.admin);

    assert_eq!(paid, 250_000);
    assert_eq!(token.balance(&h.freelancer), 250_000);
    assert_eq!(token.balance(&h.escrow.address), 0);
    assert_eq!(h.escrow.get_escrow(&r).status, EscrowStatus::Released);
}

#[test]
fn test_client_can_release() {
    let h = setup();
    let r = invoice_ref(&h.env);
    h.escrow.deposit(&r, &h.client, &h.freelancer, &h.token, &10_000);
    // The escrow's own client is also allowed to trigger release.
    h.escrow.release(&r, &h.client);
    assert_eq!(h.escrow.get_escrow(&r).status, EscrowStatus::Released);
}

#[test]
fn test_refund_returns_to_client() {
    let h = setup();
    let token = TokenClient::new(&h.env, &h.token);
    let r = invoice_ref(&h.env);

    h.escrow.deposit(&r, &h.client, &h.freelancer, &h.token, &500_000);
    let refunded = h.escrow.refund(&r, &h.client);

    assert_eq!(refunded, 500_000);
    assert_eq!(token.balance(&h.client), 1_000_000_000); // whole-made again
    assert_eq!(token.balance(&h.freelancer), 0);
    assert_eq!(h.escrow.get_escrow(&r).status, EscrowStatus::Refunded);
}

#[test]
fn test_double_deposit_same_invoice_fails() {
    let h = setup();
    let r = invoice_ref(&h.env);
    h.escrow.deposit(&r, &h.client, &h.freelancer, &h.token, &1_000);
    let res = h.escrow.try_deposit(&r, &h.client, &h.freelancer, &h.token, &1_000);
    assert_eq!(res, Err(Ok(Error::EscrowExists)));
}

#[test]
fn test_deposit_zero_amount_fails() {
    let h = setup();
    let r = invoice_ref(&h.env);
    let res = h.escrow.try_deposit(&r, &h.client, &h.freelancer, &h.token, &0);
    assert_eq!(res, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn test_release_twice_fails() {
    let h = setup();
    let r = invoice_ref(&h.env);
    h.escrow.deposit(&r, &h.client, &h.freelancer, &h.token, &1_000);
    h.escrow.release(&r, &h.admin);
    // Already released — cannot release or refund again.
    assert_eq!(h.escrow.try_release(&r, &h.admin), Err(Ok(Error::EscrowNotFunded)));
    assert_eq!(h.escrow.try_refund(&r, &h.admin), Err(Ok(Error::EscrowNotFunded)));
}

#[test]
fn test_stranger_cannot_settle() {
    let h = setup();
    let r = invoice_ref(&h.env);
    let stranger = Address::generate(&h.env);
    h.escrow.deposit(&r, &h.client, &h.freelancer, &h.token, &1_000);
    // Auth is mocked, but a non-admin / non-client is rejected by the contract.
    assert_eq!(h.escrow.try_release(&r, &stranger), Err(Ok(Error::NotAuthorized)));
    assert_eq!(h.escrow.try_refund(&r, &stranger), Err(Ok(Error::NotAuthorized)));
}

#[test]
fn test_release_unknown_escrow_fails() {
    let h = setup();
    let r = invoice_ref(&h.env);
    assert_eq!(h.escrow.try_release(&r, &h.admin), Err(Ok(Error::EscrowNotFound)));
}

#[test]
fn test_paused_blocks_deposit() {
    let h = setup();
    let r = invoice_ref(&h.env);
    h.escrow.pause();
    assert_eq!(h.escrow.is_paused(), true);
    assert_eq!(
        h.escrow.try_deposit(&r, &h.client, &h.freelancer, &h.token, &1_000),
        Err(Ok(Error::Paused))
    );
    h.escrow.unpause();
    // Unpaused — deposit now succeeds.
    h.escrow.deposit(&r, &h.client, &h.freelancer, &h.token, &1_000);
    assert_eq!(h.escrow.get_escrow(&r).status, EscrowStatus::Funded);
}
