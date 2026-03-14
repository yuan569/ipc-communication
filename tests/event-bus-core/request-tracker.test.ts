import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestTracker } from '../../event-bus-core/request-tracker';
import type { BusResponse } from '../../shared/types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

test('request tracker resolves replyTo with success payload', async () => {
  const tracker = createRequestTracker({ capacity: 2 });
  const result = deferred<BusResponse<{ ok: boolean }>>();

  const registrationError = tracker.register('req-1', 200, result.resolve);
  assert.equal(registrationError, null);

  const resolved = tracker.resolveReply('req-1', { ok: true });
  assert.equal(resolved, true);
  assert.deepEqual(await result.promise, { ok: true, data: { ok: true } });
  assert.equal(tracker.size(), 0);
});

test('request tracker times out pending request', async () => {
  const tracker = createRequestTracker({ capacity: 2 });
  const result = deferred<BusResponse<any>>();

  const registrationError = tracker.register('req-timeout', 10, result.resolve);
  assert.equal(registrationError, null);

  assert.deepEqual(await result.promise, { ok: false, error: 'timeout' });
  assert.equal(tracker.size(), 0);
});

test('request tracker rejects registrations over capacity', () => {
  const tracker = createRequestTracker({ capacity: 1 });

  const first = tracker.register('req-1', 1000, () => {});
  const second = tracker.register('req-2', 1000, () => {});

  assert.equal(first, null);
  assert.deepEqual(second, { ok: false, error: 'over_capacity' });
  assert.equal(tracker.size(), 1);
});

test('request tracker sweep removes expired entries without resolving success', () => {
  let now = 1_000;
  const tracker = createRequestTracker({ capacity: 2, now: () => now });

  const registrationError = tracker.register('req-sweep', 50, () => {});
  assert.equal(registrationError, null);
  assert.equal(tracker.size(), 1);

  now = 1_100;
  const cleaned = tracker.sweepExpired();

  assert.equal(cleaned, 1);
  assert.equal(tracker.size(), 0);
  assert.equal(tracker.resolveReply('req-sweep', { stale: true }), false);
});
