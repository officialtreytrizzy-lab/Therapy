import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const account = fs.readFileSync('api/firebase-account.js', 'utf8');
const client = fs.readFileSync('public/firebase-client.js', 'utf8');

test('data rights actions are registered', () => {
  for (const action of ['exportMyData','requestAccountDeletion','requestUnlink','confirmSharedHistoryDeletion','blockMember','saveConsentControls','listGuideBeliefs','updateGuideBelief','reportAbuse']) {
    assert.match(account, new RegExp(`${action}:|async function ${action}`));
  }
});

test('shared history deletion requires both-member confirmation', () => {
  assert.match(account, /sharedHistoryDeletionRequiresBothMembers: true/);
  assert.match(account, /every\(memberUid => confirmed\.has\(memberUid\)\)/);
});

test('email-link fallback never uses a temporary preview hostname', () => {
  assert.match(client, /AUTH_CONTINUE_URL='https:\/\/couple-wellness\.vercel\.app\/dashboard'/);
  assert.match(client, /url:AUTH_CONTINUE_URL/);
  assert.doesNotMatch(client, /url:location\.origin\+'\/dashboard'/);
});
