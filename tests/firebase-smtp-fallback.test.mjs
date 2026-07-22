import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/firebase-client.js', import.meta.url), 'utf8');

test('falls back to Firebase custom SMTP when the legacy endpoint has an SMTP/server failure', () => {
  assert.match(source, /payload\?\.error\?\.code==='EAUTH'/);
  assert.match(source, /response\.status>=500/);
  assert.match(source, /provider='firebase-ionos'/);
  assert.match(source, /sendSignInLinkToEmail/);
});

test('does not bypass explicit rate limiting', () => {
  assert.doesNotMatch(source, /response\.status===429[^}]*provider='firebase-ionos'/);
});
