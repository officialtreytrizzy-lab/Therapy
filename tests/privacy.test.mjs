import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const guide = fs.readFileSync('api/guide.js', 'utf8');
const account = fs.readFileSync('api/firebase-account.js', 'utf8');
const rules = fs.readFileSync('firestore.rules', 'utf8');

test('Guide prompt and dossier policy explicitly exclude private raw answers from partner/shared surfaces', () => {
  assert.match(guide, /Raw private answers belong only to the person/i);
  assert.match(account, /privateRawInputExcluded: true/);
  assert.match(account, /partnerBridgePromptsExcluded: true/);
});

test('Firestore keeps private subcollections self-only and server-written', () => {
  assert.match(rules, /match \/privateInteractions\/{interactionId}[\s\S]*allow read: if isSelf\(uid\);[\s\S]*allow write: if false;/);
  assert.match(rules, /match \/bridgePrompts\/{promptId}[\s\S]*allow read: if isSelf\(uid\);[\s\S]*allow write: if false;/);
});
