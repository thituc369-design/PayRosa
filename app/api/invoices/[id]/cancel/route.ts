import { and, eq, gt } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { db } from '@/server/db/client';
import { sessions } from '@/server/db/schema';
import { readSessionCookie } from '@/server/lib/cookies';
import { AppError, ok } from '@/server/lib/http';
import { invoiceService } from '@/server/service/invoice.service';

async function getPublicKey(req: NextRequest): Promise<string> {
  const sessionId = readSessionCookie(req);
  if (!sessionId) throw new AppError('UNAUTHORIZED', 'Not authenticated', 401);
  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())),
  });
  if (!session) throw new AppError('UNAUTHORIZED', 'Session expired', 401);
  return session.publicKey;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const publicKey = await getPublicKey(req);
    const { id } = await params;
    const invoice = await invoiceService.cancel(id, publicKey);
    return ok({ invoice });
  } catch (err) {
    if (err instanceof AppError)
      return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
