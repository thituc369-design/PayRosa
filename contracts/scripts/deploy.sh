#!/usr/bin/env bash
#
# Build, optimize, deploy and initialize the PayRosa invoice-escrow contract.
#
# Prereqs:
#   - Rust 1.89.0 + wasm32-unknown-unknown target
#   - Stellar CLI (v27 verified)
#   - A funded identity (Testnet auto-funds via friendbot)
#
# Usage:
#   ./scripts/deploy.sh                       # testnet, identity "deployer"
#   NETWORK=mainnet IDENTITY=prod ./scripts/deploy.sh
#
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
IDENTITY="${IDENTITY:-deployer}"
TOOLCHAIN="${TOOLCHAIN:-1.89.0}"
WASM="target/wasm32-unknown-unknown/release/payrosa_escrow.wasm"

cd "$(dirname "$0")/.."

echo "Network: $NETWORK   Identity: $IDENTITY"
ADMIN_ADDR="$(stellar keys address "$IDENTITY")"
echo "Admin address: $ADMIN_ADDR"

echo "Building contract (cargo +$TOOLCHAIN)..."
cargo +"$TOOLCHAIN" build --target wasm32-unknown-unknown --release
stellar contract optimize --wasm "$WASM" || true
OPT_WASM="target/wasm32-unknown-unknown/release/payrosa_escrow.optimized.wasm"
[ -f "$OPT_WASM" ] || OPT_WASM="$WASM"

echo "Deploying..."
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$OPT_WASM" \
  --source "$IDENTITY" \
  --network "$NETWORK")
echo "Contract id: $CONTRACT_ID"

echo "Initializing..."
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$IDENTITY" \
  --network "$NETWORK" \
  -- initialize --admin "$ADMIN_ADDR"

echo ""
echo "Done. Add to your app env (.env.local / Vercel):"
echo "   SOROBAN_ESCROW_CONTRACT_ID=$CONTRACT_ID"
echo "   NEXT_PUBLIC_SOROBAN_ESCROW_CONTRACT_ID=$CONTRACT_ID"
echo "   SOROBAN_RPC_URL=https://soroban-${NETWORK}.stellar.org"
