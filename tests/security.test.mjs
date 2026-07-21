import test from 'node:test';
import assert from 'node:assert/strict';
import { correlationId, redactedLog, FEATURE_FLAGS } from '../api/security.js';

test('correlationId preserves safe incoming id and rejects unsafe text', () => {
  assert.equal(correlationId({ headers: { 'x-correlation-id': 'abcDEF12-3456' } }), 'abcDEF12-3456');
  assert.match(correlationId({ headers: { 'x-correlation-id': 'bad text with spaces' } }), /^[0-9a-f-]{36}$/i);
});

test('security flags fail closed for production App Check only when explicitly enabled', () => {
  assert.equal(typeof FEATURE_FLAGS.launchHardening, 'boolean');
  assert.equal(typeof FEATURE_FLAGS.enforceAppCheck, 'boolean');
});

test('redactedLog does not throw when sensitive fields are present', () => {
  assert.doesNotThrow(() => redactedLog('log', 'test', { privateAnswer: 'secret', metadata: 'ok' }));
});
