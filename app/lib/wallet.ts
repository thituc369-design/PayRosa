'use client';

import { NETWORK_PASSPHRASE } from './stellar';

// Thin wrapper over @stellar/freighter-api v6. Keeps the postMessage bridge
// details (and the testnet passphrase pin) in one place so pages stay simple.

export async function isFreighterAvailable(): Promise<boolean> {
  try {
    const api = await import('@stellar/freighter-api');
    const res = await api.isConnected();
    return Boolean(res.isConnected);
  } catch {
    return false;
  }
}

/** Request access and return the wallet's public key. Throws on rejection. */
export async function connectWallet(): Promise<string> {
  const api = await import('@stellar/freighter-api');
  const connected = await api.isConnected();
  if (!connected.isConnected) {
    throw new Error('Freighter not detected. Install the Freighter browser extension.');
  }
  // requestAccess triggers the approval prompt the first time.
  const access = await api.requestAccess();
  if ('error' in access && access.error) throw new Error(String(access.error));
  const address = 'address' in access ? access.address : undefined;
  if (address) return address;
  const addr = await api.getAddress();
  if ('error' in addr && addr.error) throw new Error(String(addr.error));
  if (!addr.address) throw new Error('Could not read wallet address.');
  return addr.address;
}

/** Sign an XDR with Freighter, pinning the network passphrase to the app's network. */
export async function signXdr(xdr: string, address: string): Promise<string> {
  const api = await import('@stellar/freighter-api');
  const result = await api.signTransaction(xdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
    address,
  });
  if (typeof result === 'string') return result;
  if ('error' in result && result.error) throw new Error(String(result.error));
  return result.signedTxXdr;
}
