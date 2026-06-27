import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_NAME: z.string().default('PayRosa'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3003'),
  DRIZZLE_DATABASE_URL: z.string().url(),
  STELLAR_NETWORK: z.enum(['testnet', 'public', 'futurenet']).default('testnet'),
  STELLAR_HORIZON_URL: z.string().url().default('https://horizon-testnet.stellar.org'),
  STELLAR_NETWORK_PASSPHRASE: z.string().default('Test SDF Network ; September 2015'),
  SOROBAN_RPC_URL: z.string().url().default('https://soroban-testnet.stellar.org'),
  // Deployed PayRosa invoice-escrow Soroban contract (see contracts/DEPLOYMENT.md).
  SOROBAN_ESCROW_CONTRACT_ID: z.string().default(''),
  // SAC (Stellar Asset Contract) id of native XLM on this network.
  NATIVE_SAC_ID: z
    .string()
    .default('CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'),
  // Admin secret (contract deployer). Server-side only; triggers release/refund.
  ESCROW_ADMIN_SECRET: z.string().default(''),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 chars'),
  SESSION_COOKIE_NAME: z.string().default('payrosa_session'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  NONCE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  USDC_ASSET_CODE: z.string().default('USDC'),
  USDC_ASSET_ISSUER_TESTNET: z
    .string()
    .default('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'),
  USDC_ASSET_ISSUER_PUBLIC: z
    .string()
    .default('GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const USDC_ASSET_ISSUER_VALUE: string = (() => {
  if (parsed.data.STELLAR_NETWORK === 'public') return parsed.data.USDC_ASSET_ISSUER_PUBLIC;
  return parsed.data.USDC_ASSET_ISSUER_TESTNET;
})();

export const env = parsed.data;
export type Env = typeof env;
