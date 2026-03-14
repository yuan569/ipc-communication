import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSenderIdentity } from '../../event-bus-core/sender-auth';
import type { WindowIdentity } from '../../shared/protocol';

test('assertSenderIdentity accepts matching sender identity', () => {
  const senderMap = new Map<number, WindowIdentity>([[101, 'workbench']]);

  assert.doesNotThrow(() => {
    assertSenderIdentity(senderMap, 101, { source: 'workbench' });
  });
});

test('assertSenderIdentity rejects unknown sender', () => {
  const senderMap = new Map<number, WindowIdentity>();

  assert.throws(
    () => assertSenderIdentity(senderMap, 999, { source: 'workbench' }),
    /unknown_sender/
  );
});

test('assertSenderIdentity rejects spoofed source identity', () => {
  const senderMap = new Map<number, WindowIdentity>([[101, 'workbench']]);

  assert.throws(
    () => assertSenderIdentity(senderMap, 101, { source: 'dialer' }),
    /unauthorized_source/
  );
});
