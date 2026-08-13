import { ok } from '@/server/lib/http';
import { authService } from '@/server/service/auth.service';

export async function GET() {
  const result = await authService.sweepExpired();
  return ok(result);
}
