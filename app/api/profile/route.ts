import { and, eq, gt } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { sessions } from '@/server/db/schema';
import { readSessionCookie } from '@/server/lib/cookies';
import { AppError, ok } from '@/server/lib/http';
import { freelancerService } from '@/server/service/freelancer.service';

async function getPublicKey(req: NextRequest): Promise<string> {
  const sessionId = readSessionCookie(req);
  if (!sessionId) throw new AppError('UNAUTHORIZED', 'Not authenticated', 401);
  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())),
  });
  if (!session) throw new AppError('UNAUTHORIZED', 'Session expired', 401);
  return session.publicKey;
}

const setupSchema = z.object({
  displayName: z.string().min(1).max(100),
  walletAddress: z.string().length(56),
});

export async function GET(req: NextRequest) {
  try {
    const publicKey = await getPublicKey(req);
    const freelancer = await freelancerService.getByPublicKey(publicKey);
    return ok({ freelancer: freelancer ?? null });
  } catch (err) {
    if (err instanceof AppError)
      return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const publicKey = await getPublicKey(req);
    const body = setupSchema.parse(await req.json());
    const freelancer = await freelancerService.getOrCreate(
      publicKey,
      body.displayName,
      body.walletAddress,
    );
    return ok({ freelancer });
  } catch (err) {
    if (err instanceof AppError)
      return Response.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return Response.json({ error: err.issues }, { status: 400 });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
