import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent } from '../../event-bus-core/router';
import type { BusEvent } from '../../shared/types';

function createBaseEvent(): BusEvent {
  return {
    id: 'evt-1',
    type: 'LOCK_CUSTOMER',
    domain: 'crm',
    source: 'workbench',
    target: 'main',
    payload: { customerId: 'C-001' },
    ts: Date.now(),
  };
}

test('validateEvent accepts a valid configured event', () => {
  assert.doesNotThrow(() => validateEvent(createBaseEvent()));
});

test('validateEvent rejects unknown domain', () => {
  const event = { ...createBaseEvent(), domain: 'credit' } as any;

  assert.throws(() => validateEvent(event), /未知 domain/);
});

test('validateEvent rejects mismatched event type for domain', () => {
  const event = { ...createBaseEvent(), type: 'TICKET_ACCEPT' };

  assert.throws(() => validateEvent(event), /不属于 domain/);
});

test('validateEvent rejects unauthorized source', () => {
  const event = { ...createBaseEvent(), source: 'dialer' };

  assert.throws(() => validateEvent(event), /非法来源/);
});

test('validateEvent rejects unauthorized target', () => {
  const event = { ...createBaseEvent(), target: 'partner:auto' as any };

  assert.throws(() => validateEvent(event), /非法目标/);
});
