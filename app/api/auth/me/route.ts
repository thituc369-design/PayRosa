import { and, eq, gt } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { me } from '@/server/controller/auth.controller';
import { db } from '@/server/db/client';
import { sessions } from '@/server/db/schema';
import { readSessionCookie } from '@/server/lib/cookies';
import { AppError } from '@/server/lib/http';

export async function GET(req: NextRequest) {
  try {
    const sessionId = readSessionCookie(req);
    let publicKey: string | undefined;
    if (sessionId) {
      const session = await db.query.sessions.findFirst({
        where: and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())),
      });
      publicKey = session?.publicKey;
    }
    return me(req, { publicKey });
  } catch (err) {
    if (err instanceof AppError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
