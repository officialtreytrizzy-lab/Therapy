import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVertexJson, parseGuideJson } from '../api/_guide-core.js';

async function withFetch(mock, callback) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await callback(); }
  finally { globalThis.fetch = original; }
}

test('Vertex transport failures become a bounded public error', async () => {
  await withFetch(async () => { throw new Error('network unavailable'); }, async () => {
    await assert.rejects(
      generateVertexJson('token', 'https://example.invalid', 'system', 'prompt', 200),
      error => error?.status === 502 && error?.code === 'vertex-error' && /temporarily unavailable/i.test(error.message),
    );
  });
});

test('Vertex non-success responses preserve a safe provider message', async () => {
  await withFetch(async () => new Response(JSON.stringify({ error: { message: 'Model quota unavailable.' } }), {
    status: 503,
    headers: { 'content-type': 'application/json' },
  }), async () => {
    await assert.rejects(
      generateVertexJson('token', 'https://example.invalid', 'system', 'prompt', 200),
      error => error?.status === 502 && error?.code === 'vertex-error' && error.message === 'Model quota unavailable.',
    );
  });
});

test('Vertex success responses return only generated text and finish reason', async () => {
  await withFetch(async () => new Response(JSON.stringify({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":' }, { text: 'true}' }] } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } }), async () => {
    const result = await generateVertexJson('token', 'https://example.invalid', 'system', 'prompt', 200);
    assert.deepEqual(result, { text: '{"ok":true}', finishReason: 'STOP' });
  });
});

test('structured response parser repairs fenced or surrounded JSON without inventing data', () => {
  assert.deepEqual(parseGuideJson('```json\n{"value":1}\n```'), { value: 1 });
  assert.deepEqual(parseGuideJson('context before {"value":2} context after'), { value: 2 });
  assert.throws(() => parseGuideJson('not json'), error => error?.code === 'invalid-guide-response');
});
