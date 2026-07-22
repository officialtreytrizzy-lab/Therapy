import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emailSenderConfigured, normalizeEmail, renderSignInEmail } from '../api/auth-email-link.js';

const accountSource = `${fs.readFileSync('api/firebase-account.js', 'utf8')}\n${fs.readFileSync('api/firebase-account-route.js', 'utf8')}`;
const clientSource = `${fs.readFileSync('public/firebase-client.js', 'utf8')}\n${fs.readFileSync('public/google-auth-addon.js', 'utf8')}`;
const serverSource = fs.readFileSync('api/auth-email-link.js', 'utf8');

test('custom sign-in sender normalizes email and requires SMTP credentials', () => {
  assert.equal(normalizeEmail('  Person@Example.COM '), 'person@example.com');
  assert.equal(emailSenderConfigured(), false);
});

test('custom sign-in email explains the member ID handoff', () => {
  const link = 'https://example.com/sign-in?code=abc&next=1';
  const email = renderSignInEmail(link);
  assert.match(email.subject, /secure sign-in link/i);
  assert.match(email.text, /Open this link/);
  assert.match(email.html, /permanent 8-digit member ID/);
  assert.match(email.html, /code=abc&amp;next=1/);
});

test('profile provisioning persists verified email identity and an 8-digit member code', () => {
  assert.match(accountSource, /memberCode: code/);
  assert.match(accountSource, /emailVerified: token\.email_verified === true/);
  assert.match(accountSource, /token\.firebase\?\.sign_in_provider/);
  assert.match(accountSource, /lastAuthenticatedAt: FieldValue\.serverTimestamp\(\)/);
  assert.match(accountSource, /memberDirectory\/\$\{code\}/);
});

test('post-authentication screen exposes and copies the member ID before relationship setup', () => {
  assert.match(clientSource, /Account created/);
  assert.match(clientSource, /Your permanent member ID/);
  assert.match(clientSource, /copy-member-code/);
  assert.match(clientSource, /navigator\.clipboard\.writeText\(code\)/);
  assert.match(clientSource, /auth-email-link/);
});

test('server and client share the verified production continuation domain', () => {
  assert.match(serverSource, /https:\/\/couple-wellness-v-ideo-e-dit\.vercel\.app/);
  assert.match(clientSource, /https:\/\/couple-wellness-v-ideo-e-dit\.vercel\.app\/dashboard/);
  assert.doesNotMatch(serverSource, /https:\/\/couple-wellness\.vercel\.app/);
});
