import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/email-auth-fallback-addon.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('falls back to Firebase custom SMTP when the legacy endpoint has an SMTP/server failure', () => {
  assert.match(source, /code==='EAUTH'/);
  assert.match(source, /response\.status>=500/);
  assert.match(source, /custom-email-not-configured/);
  assert.match(source, /x-usfr-auth-fallback/);
});

test('does not bypass explicit rate limiting', () => {
  assert.match(source, /response\.status===429\)return response/);
});

test('fallback is installed before the Firebase account client', () => {
  assert.match(index, /email-auth-fallback-addon\.js[\s\S]*firebase-client\.js/);
});
