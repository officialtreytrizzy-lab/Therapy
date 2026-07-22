import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const client = await readFile(new URL('../public/firebase-client.js', import.meta.url), 'utf8');
const fallback = await readFile(new URL('../public/email-auth-fallback-addon.js', import.meta.url), 'utf8');
const source = `${client}\n${fallback}`;

test('falls back to Firebase custom SMTP when the legacy endpoint has an SMTP/server failure', () => {
  assert.match(source, /code==='EAUTH'/);
  assert.match(source, /response\.status>=500/);
  assert.match(source, /custom-email-not-configured/);
  assert.match(source, /sendSignInLinkToEmail/);
});

test('does not bypass explicit rate limiting', () => {
  assert.match(fallback, /response\.status===429\)return response/);
});
