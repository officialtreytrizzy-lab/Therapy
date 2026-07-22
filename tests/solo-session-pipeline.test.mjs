import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const relationship = fs.readFileSync(new URL('../public/relationship-v2.js', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../public/firebase-client.js', import.meta.url), 'utf8');
const account = fs.readFileSync(new URL('../api/firebase-account.js', import.meta.url), 'utf8');
const guide = fs.readFileSync(new URL('../api/guide.js', import.meta.url), 'utf8');
const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const polish = fs.readFileSync(new URL('../public/experience-polish.js', import.meta.url), 'utf8');

test('solo members can start the full guided-session pipeline', () => {
  assert.match(relationship, /Private guided session/);
  assert.match(relationship, /scope,type:selectedSeriousType/);
  assert.doesNotMatch(relationship, /Partner connection required/);
  assert.doesNotMatch(relationship, /Link your partner first/);
});

test('solo and couple sessions use separate cloud privacy scopes', () => {
  assert.match(account, /collection\('guidedSessions'\)/);
  assert.match(account, /visibility: solo \? 'owner-only' : 'shared-couple'/);
  assert.match(client, /'users',S\.user\.uid,'guidedSessions'/);
  assert.match(client, /'couples',S\.profile\.coupleId,'liveSessions'/);
  assert.match(rules, /match \/guidedSessions\/\{sessionId\}/);
  assert.match(rules, /allow read: if isSelf\(uid\)/);
});

test('Guide treats absent-partner perspectives as hypotheses', () => {
  assert.match(guide, /possible perspectives must remain labeled hypotheses/);
  assert.match(guide, /must never be surfaced to a future linked partner/);
});

test('home and modules present an equal solo pipeline', () => {
  assert.match(polish, /No partner required/);
  assert.match(polish, /My Relationship Goals/);
  assert.match(polish, /My Commitments/);
});
