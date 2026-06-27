import { EventEmitter } from 'node:events';

/**
 * In-process typed event bus. Used for SSE fan-out from background jobs
 * (Horizon stream, withdrawal poller, expiry sweeper) to the per-request
 * SSE handlers.
 *
 * Constraints (documented because they will bite us at scale):
 *   - In-process only: cross-instance fan-out needs Postgres LISTEN/NOTIFY or
 *     Redis pub/sub. Phase 1 runs one process so this is fine.
 *   - Subscribers are cleaned up via the `AbortSignal` returned by `subscribe`,
 *     preventing leaks when SSE clients disconnect without explicit unsubscribe.
 *   - Callbacks are invoked synchronously. Throw into a setImmediate so one
 *     bad subscriber cannot block the publisher.
 */

export type EventMap = {
  'invoice.updated': InvoiceEvent;
  'withdrawal.updated': WithdrawalEvent;
};

export type InvoiceEvent = {
  invoiceId: string;
  signedId: string;
  version: number;
  status: string;
  paidAt: Date | null;
  settledAt: Date | null;
  occurredAt: Date;
};

export type WithdrawalEvent = {
  withdrawalId: string;
  version: number;
  status: string;
  completedAt: Date | null;
  occurredAt: Date;
};

type Topic = keyof EventMap;

class TypedBus {
  private readonly emitter = new EventEmitter();
  private readonly counts = new Map<Topic, number>();

  constructor() {
    // Default limit is 10; raise it so a busy merchant's dashboard doesn't trip it.
    this.emitter.setMaxListeners(1000);
  }

  publish<T extends Topic>(topic: T, payload: EventMap[T]): void {
    setImmediate(() => this.emitter.emit(topic, payload));
  }

  /**
   * Subscribe to a topic. Returns an `unsubscribe` function (also bound to the
   * supplied `AbortSignal` if provided).
   */
  subscribe<T extends Topic>(
    topic: T,
    callback: (payload: EventMap[T]) => void,
    signal?: AbortSignal,
  ): () => void {
    this.emitter.on(topic, callback as (...args: unknown[]) => void);
    const count = (this.counts.get(topic) ?? 0) + 1;
    this.counts.set(topic, count);
    const unsubscribe = () => {
      this.emitter.off(topic, callback as (...args: unknown[]) => void);
      const next = (this.counts.get(topic) ?? 1) - 1;
      this.counts.set(topic, Math.max(0, next));
    };
    if (signal) {
      const onAbort = () => unsubscribe();
      if (signal.aborted) {
        unsubscribe();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }
    return unsubscribe;
  }

  /** For tests and admin: number of current subscribers per topic. */
  subscriberCount(topic: Topic): number {
    return this.counts.get(topic) ?? 0;
  }

  /** For tests. */
  reset(): void {
    this.emitter.removeAllListeners();
    this.counts.clear();
  }
}

export const eventBus = new TypedBus();
