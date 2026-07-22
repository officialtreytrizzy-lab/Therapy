import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan, validateResponse, validatePrivateCoach, validateCompletion } from '../api/guide-schema.js';
import { shouldCreateBridgePrompt } from '../api/guide.js';

test('validatePlan rejects a plan with too few modules and normalizes fields', () => {
  const bad = validatePlan({ title: 'x', modules: [{ id: 'a', title: 'A' }] });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.includes('plan-modules-insufficient'));

  const good = validatePlan({
    title: 'T', objective: 'O',
    modules: Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, title: `Module ${i}` })),
  });
  assert.equal(good.ok, true);
  assert.equal(good.value.modules.length, 6);
  assert.equal(good.value.generationStatus, 'ai-generated');
});

test('validateResponse flags empty message and coerces types', () => {
  assert.equal(validateResponse({ message: '' }).ok, false);
  const r = validateResponse({ message: 'hi', safetyFlag: 'yes', exercise: { name: 'e', steps: ['s1'] } });
  assert.equal(r.ok, true);
  assert.equal(r.value.safetyFlag, false, 'non-boolean safetyFlag becomes false');
  assert.deepEqual(r.value.exercise.steps, ['s1']);
});

test('validatePrivateCoach clamps confidence and shapes the bridge signal', () => {
  const r = validatePrivateCoach({ response: 'ok', bridgeSignal: { useful: true, targetPrompt: 'q', confidence: 5 } });
  assert.equal(r.ok, true);
  assert.equal(r.value.bridgeSignal.confidence, 1, 'confidence clamped to [0,1]');
  assert.equal(r.value.bridgeSignal.sensitivity, 'private');
});

test('validateCompletion defaults an invalid resolutionStatus to partial', () => {
  const r = validateCompletion({ resolutionStatus: 'made-up', resolutionSummary: 'done' });
  assert.equal(r.ok, true);
  assert.equal(r.value.resolutionStatus, 'partial');
});

test('validateCompletion rejects an empty summary', () => {
  assert.equal(validateCompletion({ resolutionSummary: '' }).ok, false);
});

test('bridge prompts are suppressed without consent or with a safety flag (P0 consent gate)', () => {
  const base = { consentAllowed: true, safetyFlag: false, signalUseful: true, targetPrompt: 'A neutral question?' };
  assert.equal(shouldCreateBridgePrompt(base), true, 'baseline allowed');
  assert.equal(shouldCreateBridgePrompt({ ...base, consentAllowed: false }), false, 'consent off suppresses');
  assert.equal(shouldCreateBridgePrompt({ ...base, safetyFlag: true }), false, 'safety flag suppresses');
  assert.equal(shouldCreateBridgePrompt({ ...base, signalUseful: false }), false, 'not useful suppresses');
  assert.equal(shouldCreateBridgePrompt({ ...base, targetPrompt: '   ' }), false, 'empty prompt suppresses');
});
