import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const vercel = JSON.parse(read('../vercel.json'));
const index = read('../public/index.html');
const security = read('../api/security.js');
const firebaseConfig = read('../api/firebase-config.js');
const health = read('../api/healthz.js');
const consentApi = read('../api/consent.js');
const consentGate = read('../public/consent-gate.js');
const workflow = read('../.github/workflows/public-beta.yml');
const packageJson = JSON.parse(read('../package.json'));

function header(name) {
  return vercel.headers?.flatMap(entry => entry.headers || []).find(item => item.key === name)?.value || '';
}

test('CSP blocks inline script elements and reports the remaining legacy attribute debt', () => {
  const enforced = header('Content-Security-Policy');
  const reporting = header('Content-Security-Policy-Report-Only');
  assert.match(enforced, /script-src-elem 'self'/);
  assert.match(reporting, /script-src-attr 'none'/);
  assert.match(reporting, /style-src-attr 'none'/);
  assert.match(reporting, /report-uri \/api\/csp-report/);
});

test('the app exposes accessibility, consent, and legal safeguards from the root entrypoint', () => {
  assert.match(index, /accessibility\.css/);
  assert.match(index, /legal\.css/);
  assert.match(index, /consent-gate\.css/);
  assert.match(index, /accessibility-hardening\.js/);
  assert.match(index, /legal-links\.js/);
  assert.match(index, /consent-gate\.js/);
});

test('versioned adult and wellness-policy consent is recorded server-side', () => {
  assert.match(consentApi, /POLICY_VERSION = '2026-07-31\.1'/);
  assert.match(consentApi, /policyConsentAcceptedAt/);
  assert.match(consentApi, /adultEligibilityConfirmedAt/);
  assert.match(consentApi, /verifyAppCheck/);
  assert.match(consentGate, /Decline and sign out/);
  assert.match(consentGate, /\/api\/consent/);
});

test('App Check readiness distinguishes enforcement from missing client configuration', () => {
  assert.match(security, /appCheckMisconfigured/);
  assert.match(firebaseConfig, /appCheckReady/);
  assert.match(health, /appCheckReady/);
});

test('CI includes unit, Firestore-rule, browser, accessibility, and dependency gates', () => {
  assert.match(workflow, /test:rules/);
  assert.match(workflow, /playwright install/);
  assert.match(workflow, /test:e2e/);
  assert.match(workflow, /npm audit/);
  assert.equal(packageJson.scripts['test:unit'], 'node --test tests/*.test.mjs');
});

test('Node 22 remains the declared deployment runtime', () => {
  assert.equal(packageJson.engines.node, '22.x');
  assert.equal(read('../.nvmrc').trim(), '22');
});
