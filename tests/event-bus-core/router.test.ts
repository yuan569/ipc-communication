import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent } from '../../event-bus-core/router';
import { BUS_POLICY, DOMAIN_TYPES, EVENT_POLICY } from '../../shared/protocol';
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

test('DOMAIN_TYPES entries are all covered by EVENT_POLICY', () => {
  for (const [domain, types] of Object.entries(DOMAIN_TYPES)) {
    for (const type of types) {
      assert.ok(
        type in EVENT_POLICY,
        `DOMAIN_TYPES.${domain} includes ${type} but EVENT_POLICY is missing it`
      );
      assert.equal(
        (EVENT_POLICY as Record<string, { domain: string }>)[type].domain,
        domain,
        `${type} domain mismatch between DOMAIN_TYPES and EVENT_POLICY`
      );
    }
  }
});

test('BUS_POLICY.type mirrors EVENT_POLICY', () => {
  assert.deepEqual(BUS_POLICY.type, EVENT_POLICY);
});

test('validateEvent accepts a valid configured event', () => {
  assert.doesNotThrow(() => validateEvent(createBaseEvent()));
});

test('validateEvent accepts CALL_START with configured policy', () => {
  assert.doesNotThrow(() => validateEvent({
    id: 'evt-call',
    type: 'CALL_START',
    domain: 'cti',
    source: 'workbench',
    target: '*',
    payload: { caller: '10086' },
    ts: Date.now(),
  }));
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
