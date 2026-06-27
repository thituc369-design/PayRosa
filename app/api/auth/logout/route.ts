import type { NextRequest } from 'next/server';
import { logout } from '@/server/controller/auth.controller';
import { AppError } from '@/server/lib/http';

export async function POST(req: NextRequest) {
  try {
    return await logout(req);
  } catch (err) {
    if (err instanceof AppError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
