import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('account client exposes Google sign-in with a redirect fallback', () => {
  const source = fs.readFileSync(new URL('../public/google-auth-addon.js', import.meta.url), 'utf8');
  assert.match(source, /GoogleAuthProvider/);
  assert.match(source, /signInWithPopup/);
  assert.match(source, /signInWithRedirect/);
  assert.match(source, /prompt:'select_account'/);
  assert.match(source, /Continue with Google/);
});

test('provisioned profiles record the Firebase sign-in provider', () => {
  const source = fs.readFileSync(new URL('../api/firebase-account-route.js', import.meta.url), 'utf8');
  assert.match(source, /token\.firebase\?\.sign_in_provider/);
  assert.match(source, /authProvider/);
});
