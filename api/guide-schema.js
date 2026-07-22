// Strict, dependency-free validators for the Guide's structured AI responses.
// Each validator returns { ok, value, errors }. `value` is a normalized object
// with only the expected fields and safe types, so a malformed or hallucinated
// model payload can never reach Firestore or the client unshaped.

const str = (value, max = 6000) => (value == null ? '' : String(value).slice(0, max));
const bool = value => value === true;
const arr = (value, map, max = 20) => (Array.isArray(value) ? value.slice(0, max).map(map).filter(Boolean) : []);
const num = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

function result(value, errors) {
  return { ok: errors.length === 0, value, errors };
}

export function validatePlan(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return result(null, ['plan-not-object']);
  const modules = arr(raw.modules, m => (m && typeof m === 'object' ? {
    id: str(m.id, 80),
    title: str(m.title, 200),
    purpose: str(m.purpose, 600),
    prompt: str(m.prompt, 800),
    exercise: str(m.exercise, 800),
    completionSignal: str(m.completionSignal, 400),
  } : null), 12).filter(m => m.id && m.title);
  if (modules.length < 3) errors.push('plan-modules-insufficient');
  return result({
    title: str(raw.title, 200),
    objective: str(raw.objective, 800),
    safetyGate: str(raw.safetyGate, 800),
    openingPrompt: str(raw.openingPrompt, 800),
    resolutionTargets: arr(raw.resolutionTargets, v => str(v, 300), 12),
    likelyChallenges: arr(raw.likelyChallenges, v => str(v, 300), 12),
    modules,
    generationStatus: str(raw.generationStatus, 60) || 'ai-generated',
  }, errors);
}

export function validateResponse(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return result(null, ['response-not-object']);
  const message = str(raw.message, 6000);
  if (!message.trim()) errors.push('response-empty-message');
  const exercise = raw.exercise && typeof raw.exercise === 'object' ? {
    name: str(raw.exercise.name, 200),
    steps: arr(raw.exercise.steps, v => str(v, 300), 12),
  } : null;
  return result({
    message,
    phase: str(raw.phase, 80),
    directAccountability: str(raw.directAccountability, 1400),
    probeQuestion: str(raw.probeQuestion, 800),
    exercise,
    safetyFlag: bool(raw.safetyFlag),
    resolutionMovement: str(raw.resolutionMovement, 800),
    generationStatus: str(raw.generationStatus, 60) || 'ai-generated',
  }, errors);
}

export function validatePrivateCoach(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return result(null, ['coach-not-object']);
  const response = str(raw.response, 6000);
  if (!response.trim()) errors.push('coach-empty-response');
  const signal = raw.bridgeSignal && typeof raw.bridgeSignal === 'object' ? raw.bridgeSignal : {};
  return result({
    response,
    themes: arr(raw.themes, v => str(v, 200), 8),
    safetyFlag: bool(raw.safetyFlag),
    bridgeSignal: {
      useful: bool(signal.useful),
      theme: str(signal.theme, 120),
      targetPrompt: str(signal.targetPrompt, 1000),
      suggestedExercise: str(signal.suggestedExercise, 1000),
      confidence: num(signal.confidence, 0, 1, 0),
      sensitivity: str(signal.sensitivity, 40) || 'private',
    },
    generationStatus: str(raw.generationStatus, 60) || 'ai-generated',
  }, errors);
}

const RESOLUTION_STATUSES = ['resolved', 'partial', 'paused', 'unsafe'];

export function validateCompletion(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return result(null, ['completion-not-object']);
  const resolutionStatus = RESOLUTION_STATUSES.includes(raw.resolutionStatus) ? raw.resolutionStatus : 'partial';
  const summary = str(raw.resolutionSummary, 5000);
  if (!summary.trim()) errors.push('completion-empty-summary');
  return result({
    resolutionStatus,
    resolutionSummary: summary,
    unresolved: arr(raw.unresolved, v => str(v, 400), 10),
    sharedHomework: arr(raw.sharedHomework, h => (h && typeof h === 'object' ? {
      title: str(h.title, 180),
      instructions: str(h.instructions, 1500),
      dueDays: num(h.dueDays, 1, 30, 7),
    } : null), 6).filter(h => h.title),
    secretAssignments: arr(raw.secretAssignments, a => (a && typeof a === 'object' ? {
      memberUid: str(a.memberUid, 128),
      assignment: str(a.assignment, 1500),
      internalReason: str(a.internalReason, 1000),
      partnerObservationQuestion: str(a.partnerObservationQuestion, 1000),
    } : null), 4),
    fairnessNotes: arr(raw.fairnessNotes, v => str(v, 400), 10),
    followUpTopic: str(raw.followUpTopic, 1000),
    generationStatus: str(raw.generationStatus, 60) || 'ai-generated',
  }, errors);
}

// Generic dispatcher used by tests.
export function validateGuideResponse(kind, raw) {
  switch (kind) {
    case 'plan': return validatePlan(raw);
    case 'respond': return validateResponse(raw);
    case 'privateCoach': return validatePrivateCoach(raw);
    case 'completeSession': return validateCompletion(raw);
    default: return result(null, ['unknown-kind']);
  }
}
