import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  delete: vi.fn(),
}));

vi.mock('@/server/db/client', () => ({
  db: {
    delete: (...args: unknown[]) => state.delete(...args),
  },
}));

import { authService } from '@/server/service/auth.service';

function deleteResult(rows: unknown[]) {
  return { where: () => ({ returning: () => Promise.resolve(rows) }) };
}

describe('authService.sweepExpired', () => {
  it('deletes expired sessions and nonces and reports the counts', async () => {
    state.delete
      .mockReturnValueOnce(deleteResult([{ id: 's1' }, { id: 's2' }]))
      .mockReturnValueOnce(deleteResult([{ nonce: 'n1' }]));

    const result = await authService.sweepExpired(new Date('2026-08-10T00:00:00Z'));

    expect(result).toEqual({ sessions: 2, nonces: 1 });
    expect(state.delete).toHaveBeenCalledTimes(2);
  });

  it('reports zero when nothing is expired', async () => {
    state.delete.mockReturnValueOnce(deleteResult([])).mockReturnValueOnce(deleteResult([]));

    const result = await authService.sweepExpired();

    expect(result).toEqual({ sessions: 0, nonces: 0 });
  });
});
