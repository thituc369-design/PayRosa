import { and, eq, gt } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { db } from '@/server/db/client';
import { freelancers, sessions } from '@/server/db/schema';
import { readSessionCookie } from '@/server/lib/cookies';
import { getHorizonUrl } from '@/server/stellar/network';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const sessionId = readSessionCookie(req);
  if (!sessionId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())),
  });
  if (!session) return Response.json({ error: 'Session expired' }, { status: 401 });

  const freelancer = await db.query.freelancers.findFirst({
    where: eq(freelancers.publicKey, session.publicKey),
  });
  if (!freelancer) return Response.json({ error: 'Profile not found' }, { status: 404 });

  const walletAddress = freelancer.walletAddress;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Poll Horizon for recent payments to this wallet
      const poll = async () => {
        try {
          const res = await fetch(
            `${getHorizonUrl()}/accounts/${walletAddress}/payments?order=desc&limit=10`,
            { headers: { Accept: 'application/json' } },
          );
          if (!res.ok) return;
          const json = await res.json();
          const payments = json._embedded?.records ?? [];
          send({ type: 'payments', payments: payments.slice(0, 5) });
        } catch {
          // silent
        }
      };

      await poll();
      const interval = setInterval(poll, 5000);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
