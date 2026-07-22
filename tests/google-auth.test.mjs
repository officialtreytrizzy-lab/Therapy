import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('account client exposes Google sign-in with a redirect fallback', () => {
  const source = fs.readFileSync(new URL('../public/firebase-client.js', import.meta.url), 'utf8');
  assert.match(source, /data-a=\"google\"/);
  assert.match(source, /new S\.api\.u\.GoogleAuthProvider\(\)/);
  assert.match(source, /signInWithPopup/);
  assert.match(source, /signInWithRedirect/);
});

test('provisioned profiles record the Firebase sign-in provider', () => {
  const source = fs.readFileSync(new URL('../api/firebase-account.js', import.meta.url), 'utf8');
  assert.match(source, /token\.firebase\?\.sign_in_provider/);
});
