import test from 'node:test';
import assert from 'node:assert/strict';
import accountHandler, { accountActionNames } from '../api/firebase-account.js';
import guideHandler from '../api/guide.js';
import deletionWorker, { authorized } from '../api/deletion-worker.js';
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

test('deletion worker rejects a spoofed Vercel cron header', () => {
  assert.equal(authorized({ headers: { 'x-vercel-cron': '1' } }), false);
});

test('deletion worker accepts only a configured bearer secret', () => {
  const previousCron = process.env.CRON_SECRET;
  const previousManual = process.env.DELETION_WORKER_SECRET;
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.DELETION_WORKER_SECRET = 'test-manual-secret';
  try {
    assert.equal(authorized({ headers: { authorization: 'Bearer test-cron-secret' } }), true);
    assert.equal(authorized({ headers: { authorization: 'Bearer test-manual-secret' } }), true);
    assert.equal(authorized({ headers: { authorization: 'Bearer wrong-secret' } }), false);
  } finally {
    if (previousCron == null) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCron;
    if (previousManual == null) delete process.env.DELETION_WORKER_SECRET;
    else process.env.DELETION_WORKER_SECRET = previousManual;
  }
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
