import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const emailConfirmation = readFileSync(new URL('../public/email-link-confirmation.js', import.meta.url), 'utf8');
const realLoop = readFileSync(new URL('../public/real-loop.js', import.meta.url), 'utf8');
const inclusive = readFileSync(new URL('../public/inclusive-foundation.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/real-loop.css', import.meta.url), 'utf8');

test('native email-link confirmation is intercepted before Firebase client initialization', () => {
  const confirmationIndex = index.indexOf('/email-link-confirmation.js');
  const firebaseIndex = index.indexOf('/firebase-client.js');
  assert.ok(confirmationIndex >= 0, 'email-link confirmation addon is referenced');
  assert.ok(firebaseIndex > confirmationIndex, 'confirmation addon loads before Firebase client');
  assert.match(emailConfirmation, /window\.prompt = function/);
  assert.match(emailConfirmation, /Confirm your email/);
  assert.match(emailConfirmation, /signInWithEmailLink/);
});

test('the Real Loop closes the behavior-change cycle', () => {
  assert.match(realLoop, /Regulate/);
  assert.match(realLoop, /Camera facts/);
  assert.match(realLoop, /Alternative hypothesis/);
  assert.match(realLoop, /Start the experiment/);
  assert.match(realLoop, /Verify the result/);
  assert.match(realLoop, /Prediction status/);
  assert.match(realLoop, /owner-only/iu);
  assert.match(index, /real-loop\.js/);
  assert.match(index, /real-loop\.css/);
  assert.match(css, /\.real-loop-page/);
});

test('Tennessee safety and AI-professional boundaries are explicit', () => {
  assert.match(realLoop, /Tennessee support and safety/);
  assert.match(realLoop, /press 0/);
  assert.match(realLoop, /800-560-5767/);
  assert.match(realLoop, /800-799-7233/);
  assert.match(realLoop, /not a qualified mental-health professional/);
  assert.match(realLoop, /Quick exit/);
});

test('foundation is inclusive and partner connection is optional', () => {
  assert.match(inclusive, /For anyone trying to build a healthier relationship/);
  assert.match(inclusive, /Partner optional/);
  assert.match(inclusive, /Begin privately with your own account/);
  assert.match(inclusive, /LGBTQ\+ Identity & Community/);
  assert.match(index, /Relationship Wellness/);
  assert.doesNotMatch(index, /modern Black gay couples/);
});
