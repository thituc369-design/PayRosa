import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function') {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}

process.env.DRIZZLE_DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
process.env.SESSION_SECRET ??= 'test-session-secret-at-least-32-characters-long';
process.env.STELLAR_NETWORK ??= 'testnet';
process.env.STELLAR_HORIZON_URL ??= 'https://horizon-testnet.stellar.org';
process.env.STELLAR_NETWORK_PASSPHRASE ??= 'Test SDF Network ; September 2015';
process.env.USDC_ASSET_CODE ??= 'USDC';
process.env.USDC_ASSET_ISSUER_TESTNET ??=
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
process.env.USDC_ASSET_ISSUER_PUBLIC ??= 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    }),
  });
}
