import test from 'node:test';
import assert from 'node:assert/strict';
import accountHandler, { accountActionNames } from '../api/firebase-account.js';
import guideHandler from '../api/guide.js';
import deletionWorker from '../api/deletion-worker.js';
import healthz from '../api/healthz.js';

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test('P0-5: refreshGuideDossier and deletion lifecycle actions are registered', () => {
  for (const name of ['refreshGuideDossier', 'cancelAccountDeletion', 'getDeletionStatus', 'requestUnlink', 'confirmSharedHistoryDeletion', 'blockMember']) {
    assert.ok(accountActionNames.includes(name), `missing action: ${name}`);
  }
});

test('account and guide handlers reject non-POST with 405', async () => {
  const res1 = mockRes();
  await accountHandler({ method: 'GET', headers: {} }, res1);
  assert.equal(res1.statusCode, 405);

  const res2 = mockRes();
  await guideHandler({ method: 'GET', headers: {} }, res2);
  assert.equal(res2.statusCode, 405);
});

test('deletion worker refuses unauthenticated callers', async () => {
  const res = mockRes();
  await deletionWorker({ method: 'POST', headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'unauthorized');
});

test('deletion worker accepts the Vercel cron header (auth gate only)', async () => {
  // With the cron header the auth gate passes; the run itself may fail without a
  // real OIDC token, but it must NOT be rejected as unauthorized.
  const res = mockRes();
  await deletionWorker({ method: 'POST', headers: { 'x-vercel-cron': '1' }, query: { limit: '1' } }, res);
  assert.notEqual(res.statusCode, 401);
});

test('shallow health check reports config readiness without external calls', async () => {
  const res = mockRes();
  await healthz({ method: 'GET', headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'ok');
  assert.ok(res.body.readiness);
  assert.equal(typeof res.body.readiness.firebaseConfig, 'boolean');
  assert.equal(res.body.dependencies, null, 'no deep dependency probe on shallow check');
});
