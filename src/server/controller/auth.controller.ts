import { StrKey } from '@stellar/stellar-sdk';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from '@/server/lib/cookies';
import { ok } from '@/server/lib/http';
import { authService } from '@/server/service/auth.service';
import { freelancerService } from '@/server/service/freelancer.service';

const publicKeySchema = z
  .string()
  .refine((v) => v.length === 56 && StrKey.isValidEd25519PublicKey(v), {
    message: 'INVALID_PUBLIC_KEY',
  });

const challengeSchema = z.object({
  publicKey: publicKeySchema,
});

const verifySchema = z.object({
  publicKey: publicKeySchema,
  signedNonce: z.string().min(1),
});

export async function requestChallenge(req: NextRequest) {
  const { publicKey } = challengeSchema.parse(await req.json());
  const { nonce, txXdr, expiresAt } = await authService.createChallenge(publicKey);
  return ok({ nonce, txXdr, expiresAt: expiresAt.toISOString() });
}

export async function verifyChallenge(req: NextRequest) {
  const { publicKey, signedNonce } = verifySchema.parse(await req.json());
  const { sessionId } = await authService.verifyAndCreateSession(publicKey, signedNonce);
  // Provision the freelancer's workspace on first connect. Display name defaults
  // to a truncated wallet — never a fabricated persona — and is editable later.
  const shortName = `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`;
  await freelancerService.getOrCreate(publicKey, shortName, publicKey);
  const res = ok({ ok: true });
  setSessionCookie(res, sessionId);
  return res;
}

export async function logout(req: NextRequest) {
  const sessionId = readSessionCookie(req);
  if (sessionId) {
    const { authService } = await import('@/server/service/auth.service');
    await authService.destroySession(sessionId);
  }
  const res = ok({ ok: true });
  clearSessionCookie(res);
  return res;
}

export async function me(_req: NextRequest, ctx: { publicKey?: string }) {
  return ok({ publicKey: ctx.publicKey ?? null });
}
