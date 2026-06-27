import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from '@/server/lib/cookies';
import { eventBus } from '@/server/lib/eventBus';
import { AppError, created, fail, fromError, ok } from '@/server/lib/http';
import { logger } from '@/server/lib/logger';

describe('http.AppError', () => {
  it('stores code, status and details', () => {
    const err = new AppError('NOT_FOUND', 'missing', 404, { id: '1' });
    expect(err.code).toBe('NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err.details).toEqual({ id: '1' });
    expect(err.message).toBe('missing');
    expect(err.name).toBe('AppError');
  });

  it('defaults status to 400', () => {
    const err = new AppError('INVALID_INPUT', 'bad');
    expect(err.status).toBe(400);
  });
});

describe('http.ok / created / fail', () => {
  it('ok wraps data in success envelope', async () => {
    const res = ok({ value: 42 });
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { value: 42 } });
  });

  it('ok accepts ResponseInit', async () => {
    const res = ok({ a: 1 }, { status: 202 });
    expect(res.status).toBe(202);
  });

  it('created sets 201', async () => {
    const res = created({ id: 'x' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('fail produces error envelope with status', async () => {
    const res = fail('FORBIDDEN', 'nope', 403, { reason: 'x' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'nope', details: { reason: 'x' } },
    });
  });
});

describe('http.fromError', () => {
  it('maps AppError to its code/status', async () => {
    const res = fromError(new AppError('CONFLICT', 'dup', 409));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    if (!body.ok) expect(body.error.code).toBe('CONFLICT');
  });

  it('maps ZodError-like object via issues', async () => {
    const zodLike = { name: 'ZodError', issues: [{ path: ['amount'], message: 'INVALID_INPUT' }] };
    const res = fromError(zodLike);
    expect(res.status).toBe(400);
    const body = await res.json();
    if (!body.ok) expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('maps INVALID_PUBLIC_KEY refine message to its code', async () => {
    const zodLike = { name: 'ZodError', issues: [{ path: ['pk'], message: 'INVALID_PUBLIC_KEY' }] };
    const res = fromError(zodLike);
    const body = await res.json();
    if (!body.ok) expect(body.error.code).toBe('INVALID_PUBLIC_KEY');
  });

  it('falls back to INTERNAL 500 for unknown errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = fromError(new Error('boom'));
    expect(res.status).toBe(500);
    const body = await res.json();
    if (!body.ok) expect(body.error.code).toBe('INTERNAL');
    spy.mockRestore();
  });
});

describe('cookies', () => {
  it('setSessionCookie appends Set-Cookie with HttpOnly', () => {
    const res = new Response(null);
    setSessionCookie(res, 'sess-1');
    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain('sess-1');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Max-Age=');
  });

  it('clearSessionCookie sets Max-Age=0', () => {
    const res = new Response(null);
    clearSessionCookie(res);
    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain('Max-Age=0');
  });

  it('readSessionCookie reads value from request', () => {
    const fakeReq = {
      cookies: { get: (_name: string) => ({ value: 'abc' }) },
    } as unknown as Parameters<typeof readSessionCookie>[0];
    expect(readSessionCookie(fakeReq)).toBe('abc');
  });

  it('readSessionCookie returns null when missing', () => {
    const fakeReq = {
      cookies: { get: (_name: string) => undefined },
    } as unknown as Parameters<typeof readSessionCookie>[0];
    expect(readSessionCookie(fakeReq)).toBeNull();
  });
});

describe('logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('info logs to console.log', () => {
    logger.info('hello', { a: 1 });
    expect(logSpy).toHaveBeenCalledOnce();
  });

  it('warn logs to console.warn', () => {
    logger.warn('careful');
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('error logs to console.error', () => {
    logger.error('bad');
    expect(errSpy).toHaveBeenCalledOnce();
  });

  it('debug logs in non-production', () => {
    logger.debug('dbg');
    expect(logSpy).toHaveBeenCalledOnce();
  });

  it('pubkey truncates long keys', () => {
    const truncated = logger.pubkey('GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37');
    expect(truncated).toContain('…');
    expect(truncated.length).toBeLessThan(20);
  });

  it('pubkey returns <none> for null', () => {
    expect(logger.pubkey(null)).toBe('<none>');
  });

  it('pubkey returns short keys unchanged', () => {
    expect(logger.pubkey('short')).toBe('short');
  });
});

describe('eventBus', () => {
  beforeEach(() => eventBus.reset());

  it('publishes events to subscribers asynchronously', async () => {
    const received: unknown[] = [];
    eventBus.subscribe('invoice.updated', (p) => received.push(p));
    const payload = {
      invoiceId: 'i1',
      signedId: 's1',
      version: 1,
      status: 'paid',
      paidAt: new Date(),
      settledAt: null,
      occurredAt: new Date(),
    };
    eventBus.publish('invoice.updated', payload);
    await new Promise((r) => setTimeout(r, 10));
    expect(received).toHaveLength(1);
  });

  it('tracks subscriber counts', () => {
    const unsub = eventBus.subscribe('withdrawal.updated', () => {});
    expect(eventBus.subscriberCount('withdrawal.updated')).toBe(1);
    unsub();
    expect(eventBus.subscriberCount('withdrawal.updated')).toBe(0);
  });

  it('unsubscribes via AbortSignal', () => {
    const ctrl = new AbortController();
    eventBus.subscribe('invoice.updated', () => {}, ctrl.signal);
    expect(eventBus.subscriberCount('invoice.updated')).toBe(1);
    ctrl.abort();
    expect(eventBus.subscriberCount('invoice.updated')).toBe(0);
  });

  it('immediately unsubscribes if signal already aborted', () => {
    const ctrl = new AbortController();
    ctrl.abort();
    eventBus.subscribe('invoice.updated', () => {}, ctrl.signal);
    expect(eventBus.subscriberCount('invoice.updated')).toBe(0);
  });
});
