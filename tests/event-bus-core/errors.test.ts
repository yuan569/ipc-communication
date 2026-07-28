import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBusError } from '../../event-bus-core/errors';

test('normalizeBusError maps known messages to stable codes', () => {
  assert.equal(normalizeBusError(new Error('timeout')), 'timeout');
  assert.equal(normalizeBusError(new Error('over_capacity')), 'over_capacity');
  assert.equal(normalizeBusError(new Error('duplicate_request')), 'duplicate_request');
  assert.equal(normalizeBusError(new Error('unknown_sender')), 'unknown_sender');
  assert.equal(normalizeBusError(new Error('unauthorized_source')), 'unauthorized_source');
  assert.equal(normalizeBusError(new Error('unauthorized_reply')), 'unauthorized_reply');
  assert.equal(normalizeBusError(new Error('reply_type_mismatch')), 'reply_type_mismatch');
  assert.equal(normalizeBusError(new Error('非法事件格式')), 'invalid_event');
  assert.equal(normalizeBusError(new Error('未知 domain: credit')), 'unknown_domain');
  assert.equal(normalizeBusError(new Error('事件 CREDIT_APPLY 不属于 domain credit')), 'invalid_domain_type');
  assert.equal(normalizeBusError(new Error('非法目标: partner:auto 不能接收 LOCK_CUSTOMER')), 'invalid_target');
});

test('normalizeBusError falls back to internal_error for unknown failures', () => {
  assert.equal(normalizeBusError(new Error('something_else')), 'internal_error');
  assert.equal(normalizeBusError(undefined), 'internal_error');
});
