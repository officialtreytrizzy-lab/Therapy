import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const account = fs.readFileSync('api/firebase-account.js', 'utf8');
const client = fs.readFileSync('public/firebase-client.js', 'utf8');
const emailFallback = fs.readFileSync('public/email-auth-fallback-addon.js', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');

test('data rights actions are registered', () => {
  for (const action of ['exportMyData','requestAccountDeletion','requestUnlink','confirmSharedHistoryDeletion','blockMember','saveConsentControls','listGuideBeliefs','updateGuideBelief','reportAbuse']) {
    assert.match(account, new RegExp(`${action}:|async function ${action}`));
  }
});

test('shared history deletion requires both-member confirmation', () => {
  assert.match(account, /sharedHistoryDeletionRequiresBothMembers: true/);
  assert.match(account, /every\(memberUid => confirmed\.has\(memberUid\)\)/);
});

test('email-link fallback always uses the verified production continuation URL', () => {
  assert.match(emailFallback, /AUTH_CONTINUE_URL='https:\/\/couple-wellness-v-ideo-e-dit\.vercel\.app\/dashboard'/);
  assert.match(emailFallback, /continueUrl:AUTH_CONTINUE_URL/);
  assert.match(index, /email-auth-fallback-addon\.js[\s\S]*firebase-client\.js/);
  assert.match(client, /sendSignInLinkToEmail/);
});
