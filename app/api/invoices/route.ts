import { and, eq, gt } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
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

const createSchema = z.object({
  clientName: z.string().min(1).max(100),
  clientEmail: z.string().email().optional(),
  description: z.string().min(1).max(500),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,7})?$/, 'Enter a valid amount')
    .refine((v) => Number(v) > 0, 'Amount must be greater than zero'),
  asset: z.enum(['XLM', 'USDC']).default('XLM'),
});

export async function GET(req: NextRequest) {
  try {
    const publicKey = await getPublicKey(req);
    const invoices = await invoiceService.list(publicKey);
    return ok({ invoices });
  } catch (err) {
    if (err instanceof AppError)
      return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const publicKey = await getPublicKey(req);
    const body = createSchema.parse(await req.json());
    const invoice = await invoiceService.create({
      publicKey,
      clientName: body.clientName,
      clientEmail: body.clientEmail,
      description: body.description,
      amount: body.amount,
      asset: body.asset,
    });
    return ok({ invoice }, { status: 201 });
  } catch (err) {
    if (err instanceof AppError)
      return Response.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return Response.json({ error: err.issues }, { status: 400 });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
