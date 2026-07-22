import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('public/index.html', 'utf8');
const vercel = fs.readFileSync('vercel.json', 'utf8');
const accountRoute = fs.readFileSync('api/firebase-account-route.js', 'utf8');
const guideRoute = fs.readFileSync('api/guide-route.js', 'utf8');
const deletionWorker = fs.readFileSync('api/deletion-worker.js', 'utf8');

test('merge resolution preserves the luxury workspace and conflict calibrator assets', () => {
  assert.match(index, /luxury\.css/);
  assert.match(index, /experience-polish\.css/);
  assert.match(index, /luxury-ui\.js/);
  assert.match(index, /experience-polish\.js/);
  assert.match(index, /google-auth-addon\.js/);
  assert.match(index, /aria-live="polite"/);
});

test('production API rewrites use consistency wrappers', () => {
  assert.match(vercel, /firebase-account-route\.js/);
  assert.match(vercel, /guide-route\.js/);
});

test('account wrapper fixes provider metadata, cancellation status, and parent deletion', () => {
  assert.match(accountRoute, /token\.firebase\?\.sign_in_provider/);
  assert.match(accountRoute, /relationshipStatus: 'linked'/);
  assert.match(accountRoute, /confirmSharedHistoryDeletion/);
  assert.match(accountRoute, /couples\/\$\{priorCoupleId\}/);
  assert.match(accountRoute, /\.delete\(\)/);
});

test('scheduled erasure removes deleted couple parent documents', () => {
  assert.match(deletionWorker, /status === 'deleted'/);
  assert.match(deletionWorker, /await ref\.delete\(\)/);
});

test('completion wrapper returns retry state and resets stale claims', () => {
  assert.match(guideRoute, /completion-in-progress/);
  assert.match(guideRoute, /completion-claim-reset/);
  assert.match(guideRoute, /status: 'active'/);
  assert.match(guideRoute, /completionClaimedAt: FieldValue\.delete\(\)/);
});
