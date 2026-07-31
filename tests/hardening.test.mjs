import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const appRouter = readFileSync(new URL('../public/app4.js', import.meta.url), 'utf8');
const accountApi = readFileSync(new URL('../api/firebase-account.js', import.meta.url), 'utf8');
const guideApi = readFileSync(new URL('../api/guide.js', import.meta.url), 'utf8');
const guideCore = readFileSync(new URL('../api/_guide-core.js', import.meta.url), 'utf8');
const accountRoute = readFileSync(new URL('../api/firebase-account-route.js', import.meta.url), 'utf8');
const guideRoute = readFileSync(new URL('../api/guide-route.js', import.meta.url), 'utf8');
const accountPostprocess = readFileSync(new URL('../api/account-postprocess.js', import.meta.url), 'utf8');
const authEmail = readFileSync(new URL('../api/auth-email-link.js', import.meta.url), 'utf8');
const security = readFileSync(new URL('../api/security.js', import.meta.url), 'utf8');
const deletionWorker = readFileSync(new URL('../api/deletion-worker.js', import.meta.url), 'utf8');
const buildScript = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('private routes fail closed while Firebase authentication is unresolved', () => {
  assert.match(appRouter, /if\(!bridge\|\|!fb\?\.ready\)return privateLoading\(\)/);
  assert.match(appRouter, /path==='\/sign-in'\)html=signInPage\(\)/);
  assert.doesNotMatch(appRouter, /path==='\/sign-in'\)html=dashboard\(\)/);
});

test('permanent member IDs use cryptographic integer generation', () => {
  assert.match(accountApi, /randomInt\(10_000_000, 100_000_000\)/);
  assert.doesNotMatch(accountApi, /Math\.random\(\)/);
});

test('Guide authentication checks issued-at claims and bounds external calls', () => {
  assert.match(guideCore, /Number\.isFinite\(payload\.iat\)/);
  assert.match(guideCore, /payload\.auth_time/);
  assert.match(guideCore, /payload\.sub\.length <= 128/);
  assert.match(guideCore, /AbortSignal\.timeout\(EXTERNAL_FETCH_TIMEOUT_MS\)/);
});

test('route wrappers use only tokens verified by their canonical handlers', () => {
  assert.match(accountApi, /res\.__verifiedFirebaseToken = token/);
  assert.match(guideApi, /res\.__verifiedFirebaseToken = token/);
  assert.match(accountRoute, /captured\.__verifiedFirebaseToken/);
  assert.match(accountApi, /res\.__priorCoupleId = userSnap\.data\(\)\?\.coupleId \|\| null/);
  assert.match(accountRoute, /captured\.__priorCoupleId/);
  assert.match(guideRoute, /captured\.__verifiedFirebaseToken/);
  assert.doesNotMatch(accountRoute, /decodeFirebaseToken/);
  assert.doesNotMatch(guideRoute, /decodeFirebaseToken/);
  assert.doesNotMatch(accountPostprocess, /decodeFirebaseToken/);
});

test('authentication email and App Check calls have bounded network timeouts', () => {
  assert.match(authEmail, /signal: AbortSignal\.timeout\(EXTERNAL_FETCH_TIMEOUT_MS\)/);
  assert.match(authEmail, /connectionTimeout: SMTP_TIMEOUT_MS/);
  assert.match(authEmail, /socketTimeout: SMTP_TIMEOUT_MS/);
  assert.match(security, /signal: AbortSignal\.timeout\(EXTERNAL_FETCH_TIMEOUT_MS\)/);
  assert.match(security, /app-check-unavailable/);
});

test('destructive deletion runs require bearer-secret authorization', () => {
  assert.match(deletionWorker, /process\.env\.CRON_SECRET/);
  assert.match(deletionWorker, /timingSafeEqual/);
  assert.doesNotMatch(deletionWorker, /if \(req\.headers\['x-vercel-cron'\]\) return true/);
});

test('the build audit normalizes asset paths across operating systems', () => {
  assert.match(buildScript, /relative\(publicDir, f\)\.split\(sep\)\.join\('\/'\)/);
});

test('the vulnerable brace-expansion chain is overridden to the patched release', () => {
  assert.equal(packageJson.overrides?.['brace-expansion'], '5.0.9');
});

test('the abandoned eval-based premium loader and chunks are removed', () => {
  assert.equal(existsSync(new URL('../public/premium-loader.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../public/premium', import.meta.url)), false);
  assert.equal(existsSync(new URL('../public/premium2', import.meta.url)), false);
});
