// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  insertNonce: vi.fn(),
  selectNonce: vi.fn(),
  updateNonce: vi.fn(),
  insertSession: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock('@/server/db/client', () => ({
  db: {
    // insert is used for both nonce (awaited directly) and session (.returning()).
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        if ('nonce' in vals) return state.insertNonce();
        return { returning: () => state.insertSession() };
      },
    }),
    select: () => ({ from: () => ({ where: () => state.selectNonce() }) }),
    update: () => ({ set: () => ({ where: () => state.updateNonce() }) }),
    delete: () => ({ where: () => state.deleteSession() }),
  },
}));

import { Account, BASE_FEE, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { AppError } from '@/server/lib/http';
import { authService } from '@/server/service/auth.service';

const PASSPHRASE = 'Test SDF Network ; September 2015';
// Fixed testnet keypairs (jsdom lacks the RNG Keypair.random() needs).
const SECRET = 'SAHOYZLMXMMRVBJVPNWEG7WJKWQ4UIZ2BSONHZGUB6OSNKG4FYSQ4AS2';
const OTHER_SECRET = 'SB4LIJOFU3RODWZUW4CLP772L2EXCHBFKJ7MXF7QK7FPSXCHN3CAUUYO';
const makeKp = () => Keypair.fromSecret(SECRET);

beforeEach(() => {
  for (const fn of Object.values(state)) fn.mockReset();
});

describe('authService.createChallenge', () => {
  it('rejects an invalid public key', async () => {
    await expect(authService.createChallenge('not-a-key')).rejects.toBeInstanceOf(AppError);
  });

  it('returns a nonce and txXdr for a valid key', async () => {
    state.insertNonce.mockResolvedValueOnce(undefined);
    const kp = makeKp();
    const result = await authService.createChallenge(kp.publicKey());
    expect(result.nonce).toBeTruthy();
    expect(result.txXdr).toBeTruthy();
    expect(result.expiresAt).toBeInstanceOf(Date);
  });
});

describe('authService.verifyAndCreateSession', () => {
  it('rejects an invalid public key', async () => {
    await expect(authService.verifyAndCreateSession('bad', 'xdr')).rejects.toMatchObject({
      code: 'INVALID_PUBLIC_KEY',
    });
  });

  it('rejects malformed XDR', async () => {
    const kp = makeKp();
    await expect(
      authService.verifyAndCreateSession(kp.publicKey(), 'not-xdr'),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects when signature does not match', async () => {
    const kp = makeKp();
    // Build a valid challenge tx but sign with a DIFFERENT key.
    const account = new Account(kp.publicKey(), '0');
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
      .addOperation(Operation.manageData({ name: 'auth_nonce', value: Buffer.from('nonce123') }))
      .setTimeout(300)
      .build();
    tx.sign(Keypair.fromSecret(OTHER_SECRET)); // wrong signer
    await expect(
      authService.verifyAndCreateSession(kp.publicKey(), tx.toXDR()),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects when nonce not found in DB', async () => {
    const kp = makeKp();
    const account = new Account(kp.publicKey(), '0');
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
      .addOperation(Operation.manageData({ name: 'auth_nonce', value: Buffer.from('nonce123') }))
      .setTimeout(300)
      .build();
    tx.sign(kp);
    state.selectNonce.mockResolvedValueOnce([]); // no matching nonce
    await expect(
      authService.verifyAndCreateSession(kp.publicKey(), tx.toXDR()),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('creates a session for a valid signed challenge with a known nonce', async () => {
    const kp = makeKp();
    const account = new Account(kp.publicKey(), '0');
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
      .addOperation(Operation.manageData({ name: 'auth_nonce', value: Buffer.from('nonce123') }))
      .setTimeout(300)
      .build();
    tx.sign(kp);
    state.selectNonce.mockResolvedValueOnce([{ nonce: 'nonce123', publicKey: kp.publicKey() }]);
    state.updateNonce.mockResolvedValueOnce(undefined);
    state.insertSession.mockResolvedValueOnce([{ id: 'session-1' }]);
    const result = await authService.verifyAndCreateSession(kp.publicKey(), tx.toXDR());
    expect(result.sessionId).toBe('session-1');
  });
});

describe('authService.destroySession', () => {
  it('deletes the session', async () => {
    state.deleteSession.mockResolvedValueOnce(undefined);
    await expect(authService.destroySession('s1')).resolves.toBeUndefined();
    expect(state.deleteSession).toHaveBeenCalledOnce();
  });
});
