.PHONY: test build optimize lint clean

# Pin to the toolchain the contract is verified on.
TOOLCHAIN ?= 1.89.0
WASM := target/wasm32-unknown-unknown/release/payrosa_escrow.wasm

test:
	cargo +$(TOOLCHAIN) test

build:
	cargo +$(TOOLCHAIN) build --target wasm32-unknown-unknown --release

optimize: build
	stellar contract optimize --wasm $(WASM)

lint:
	cargo +$(TOOLCHAIN) clippy -- -D warnings

clean:
	cargo clean
