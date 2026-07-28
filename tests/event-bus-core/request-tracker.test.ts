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

const dialerMeta = { type: 'OUTBOUND_DISPATCH', expectedResponder: 'dialer' };

test('request tracker resolves authorized replyTo with success payload', async () => {
  const tracker = createRequestTracker({ capacity: 2 });
  const result = deferred<BusResponse<{ ok: boolean }>>();

  const registrationError = tracker.register('req-1', 200, result.resolve, dialerMeta);
  assert.equal(registrationError, null);

  const resolved = tracker.resolveReply({
    replyTo: 'req-1',
    type: 'OUTBOUND_DISPATCH',
    source: 'dialer',
    payload: { ok: true },
  });
  assert.equal(resolved, true);
  assert.deepEqual(await result.promise, { ok: true, data: { ok: true } });
  assert.equal(tracker.size(), 0);
});

test('request tracker rejects unauthorized reply without consuming pending', async () => {
  const tracker = createRequestTracker({ capacity: 2 });
  const result = deferred<BusResponse<any>>();

  tracker.register('req-auth', 200, result.resolve, dialerMeta);

  assert.throws(
    () => tracker.resolveReply({
      replyTo: 'req-auth',
      type: 'OUTBOUND_DISPATCH',
      source: 'partner:credit',
      payload: { hijacked: true },
    }),
    /unauthorized_reply/
  );
  assert.equal(tracker.size(), 1);

  // 合法回包方仍可完成
  tracker.resolveReply({
    replyTo: 'req-auth',
    type: 'OUTBOUND_DISPATCH',
    source: 'dialer',
    payload: { accepted: true },
  });
  assert.deepEqual(await result.promise, { ok: true, data: { accepted: true } });
});

test('request tracker rejects reply type mismatch without consuming pending', () => {
  const tracker = createRequestTracker({ capacity: 2 });
  tracker.register('req-type', 1000, () => {}, dialerMeta);

  assert.throws(
    () => tracker.resolveReply({
      replyTo: 'req-type',
      type: 'LOCK_CUSTOMER',
      source: 'dialer',
      payload: {},
    }),
    /reply_type_mismatch/
  );
  assert.equal(tracker.size(), 1);
});

test('request tracker times out pending request', async () => {
  const tracker = createRequestTracker({ capacity: 2 });
  const result = deferred<BusResponse<any>>();

  const registrationError = tracker.register('req-timeout', 10, result.resolve, dialerMeta);
  assert.equal(registrationError, null);

  assert.deepEqual(await result.promise, { ok: false, error: 'timeout' });
  assert.equal(tracker.size(), 0);
});

test('request tracker rejects registrations over capacity', () => {
  const tracker = createRequestTracker({ capacity: 1 });

  const first = tracker.register('req-1', 1000, () => {}, dialerMeta);
  const second = tracker.register('req-2', 1000, () => {}, dialerMeta);

  assert.equal(first, null);
  assert.deepEqual(second, { ok: false, error: 'over_capacity' });
  assert.equal(tracker.size(), 1);
});

test('request tracker rejects duplicate request ids', () => {
  const tracker = createRequestTracker({ capacity: 2 });

  const first = tracker.register('req-dup', 1000, () => {}, dialerMeta);
  const second = tracker.register('req-dup', 1000, () => {}, dialerMeta);

  assert.equal(first, null);
  assert.deepEqual(second, { ok: false, error: 'duplicate_request' });
  assert.equal(tracker.size(), 1);
});

test('request tracker rejects broadcast target as request responder', () => {
  const tracker = createRequestTracker({ capacity: 2 });
  const result = tracker.register('req-star', 1000, () => {}, {
    type: 'LOG',
    expectedResponder: '*',
  });
  assert.deepEqual(result, { ok: false, error: 'invalid_target' });
});

test('request tracker failPending resolves with error', async () => {
  const tracker = createRequestTracker({ capacity: 2 });
  const result = deferred<BusResponse<any>>();

  tracker.register('req-fail', 1000, result.resolve, dialerMeta);
  assert.equal(tracker.failPending('req-fail', 'invalid_event'), true);
  assert.deepEqual(await result.promise, { ok: false, error: 'invalid_event' });
  assert.equal(tracker.size(), 0);
});

test('request tracker sweep removes expired entries without resolving success', () => {
  let now = 1_000;
  const tracker = createRequestTracker({ capacity: 2, now: () => now });

  const registrationError = tracker.register('req-sweep', 50, () => {}, dialerMeta);
  assert.equal(registrationError, null);
  assert.equal(tracker.size(), 1);

  now = 1_100;
  const cleaned = tracker.sweepExpired();

  assert.equal(cleaned, 1);
  assert.equal(tracker.size(), 0);
  assert.equal(
    tracker.resolveReply({
      replyTo: 'req-sweep',
      type: 'OUTBOUND_DISPATCH',
      source: 'dialer',
      payload: { stale: true },
    }),
    false
  );
});
