import { FieldValue, Timestamp } from '@google-cloud/firestore';
import { clean, db, gemini, httpError, requireUser, runWithGoogle } from './_guide-core.js';

const RATE_MIN = Number(process.env.COUPLES_THERAPY_RATE_MIN_USD || 150);
const RATE_MAX = Number(process.env.COUPLES_THERAPY_RATE_MAX_USD || 400);

const GUIDE_STANDARD = `You are the Guide for US, FOR REAL, a therapy-informed relationship-wellness application. Never claim to be a licensed therapist.

PRIVACY
- Raw private answers belong only to the person who gave them.
- Never quote, closely paraphrase, attribute, hint at, or expose a partner's private answer.
- Partner-derived bridge prompts are sanitized themes only. Treat them as hypotheses, not facts.
- Shared live-session turns are visible to both participants.

FAIRNESS AND ACCOUNTABILITY
- Be fair without forcing 50/50 blame.
- If direct evidence shows that a behavior, request, or approach is unfair, controlling, dismissive, deceptive, unsafe, or unreasonable, say so respectfully and directly.
- Explain why, separate intent from impact, and offer a concrete alternative.
- Never diagnose, name-call, or mind-read.

FACILITATION
- The current session topic and current direct input are primary. Historical context only helps assess patterns, safety, and what may matter.
- Reflect before advising. Ask one focused probing question at a time.
- Use one tailored example when teaching.
- Work toward a truthful resolution, partial agreement, safe pause, or explicit next step. Never invent agreement.
- If there is coercion, intimidation, threats, stalking, sexual violence, or fear, stop ordinary conjoint exercises and prioritize safety.
- Secret assignments must be constructive, observable, and must never encourage surveillance, testing, deception, manipulation, or boundary violations.`;

async function userAndCouple(uid) {
  const userSnap = await db().doc(`users/${uid}`).get();
  const user = userSnap.data();
  if (!user) throw httpError(404, 'Your member profile was not found.', 'profile-not-found');
  if (!user.coupleId) return { user, coupleId: null, couple: null, coupleRef: null };
  const coupleRef = db().doc(`couples/${user.coupleId}`);
  const coupleSnap = await coupleRef.get();
  if (!coupleSnap.exists || !coupleSnap.data().memberUids?.includes(uid)) throw httpError(403, 'Couple access denied.', 'forbidden');
  return { user, coupleId: user.coupleId, couple: coupleSnap.data(), coupleRef };
}

async function sessionContext(uid, sessionId) {
  const base = await userAndCouple(uid);
  if (!base.coupleRef) throw httpError(409, 'Link a partner before starting a joint session.', 'couple-required');
  const sessionRef = base.coupleRef.collection('liveSessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists || !sessionSnap.data().memberUids?.includes(uid)) throw httpError(404, 'Session not found.', 'session-not-found');
  const [dossierSnap, turnsSnap, privateSnap, promptSnap, membersSnap] = await Promise.all([
    base.coupleRef.collection('guide').doc('dossier').get(),
    sessionRef.collection('turns').orderBy('createdAt', 'asc').limit(80).get(),
    db().collection(`users/${uid}/privateInteractions`).orderBy('createdAt', 'desc').limit(12).get(),
    db().collection(`users/${uid}/bridgePrompts`).orderBy('createdAt', 'desc').limit(12).get(),
    base.coupleRef.collection('members').get(),
  ]);
  const now = Date.now();
  const bridgePrompts = promptSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(item => !item.expiresAt?.toMillis || item.expiresAt.toMillis() > now);
  return {
    ...base,
    sessionRef,
    session: { id: sessionId, ...sessionSnap.data() },
    dossier: dossierSnap.data()?.structured || {},
    turns: turnsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
    ownPrivate: privateSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
    bridgePrompts,
    members: membersSnap.docs.map(doc => doc.data()),
  };
}

function contextSummary(ctx) {
  return JSON.stringify({
    session: {
      type: ctx.session.type,
      topic: ctx.session.topic,
      scenario: ctx.session.scenario,
      desiredOutcome: ctx.session.desiredOutcome,
      emotionalIntensity: ctx.session.emotionalIntensity,
      safetyConcern: ctx.session.safetyConcern,
      plan: ctx.session.plan || null,
    },
    sharedDossier: ctx.dossier,
    currentUserPrivateContext: ctx.ownPrivate.map(item => ({ type: item.type, userInput: item.content })),
    sanitizedPromptsForCurrentUser: ctx.bridgePrompts.map(item => ({ theme: item.theme, prompt: item.prompt, exercise: item.suggestedExercise, confidence: item.confidence })),
    sharedTurns: ctx.turns.map(turn => ({ role: turn.role, speakerName: turn.speakerName, content: turn.content })),
  });
}

async function writeLedger(coupleRef, event) {
  await coupleRef.collection('interactionLedger').add({
    eventType: clean(event.eventType, 80),
    actorUid: event.actorUid || null,
    sessionId: event.sessionId || null,
    visibility: event.visibility || 'shared-metadata',
    source: event.source || 'user-input',
    summary: clean(event.summary, 500),
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function purgeExpired(coupleRef) {
  const snapshot = await coupleRef.collection('derivedSignals').where('expiresAt', '<=', Timestamp.now()).limit(100).get();
  if (snapshot.empty) return;
  const batch = db().batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}

async function planSession(uid, data) {
  const ctx = await sessionContext(uid, clean(data.sessionId, 100));
  await purgeExpired(ctx.coupleRef);
  const result = await gemini(
    GUIDE_STANDARD,
    `Build a serious progressive couple-session plan around the current topic. The plan may last ${ctx.session.durationLimitMinutes} minutes, but must adapt to safety and progress. Return JSON with title, objective, safetyGate, openingPrompt, resolutionTargets array, likelyChallenges array, and modules array of 6-10 objects with id, title, purpose, prompt, exercise, completionSignal.\n\nCONTEXT:\n${contextSummary(ctx)}`,
  );
  await ctx.sessionRef.set({ plan: result, phase: 'planned', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return result;
}

async function respond(uid, data) {
  const sessionId = clean(data.sessionId, 100);
  const message = clean(data.message, 6000);
  if (!message) throw httpError(400, 'Enter a response.', 'message-required');
  const ctx = await sessionContext(uid, sessionId);
  const speaker = ctx.members.find(member => member.uid === uid)?.displayName || ctx.user.displayName || 'Partner';
  await ctx.sessionRef.collection('turns').add({ role: 'user', authorUid: uid, speakerName: speaker, content: message, source: 'user-input', createdAt: FieldValue.serverTimestamp() });
  ctx.turns.push({ role: 'user', speakerName: speaker, content: message });
  const result = await gemini(
    GUIDE_STANDARD,
    `Respond to the newest shared-session turn. Return JSON with message, phase, directAccountability string or empty, probeQuestion one question or empty, exercise object or null, safetyFlag boolean, resolutionMovement string. If someone is wrong or unfair based on direct evidence, state it respectfully and explain the better alternative.\n\nCONTEXT:\n${contextSummary(ctx)}`,
  );
  await ctx.sessionRef.collection('turns').add({ role: 'guide', speakerName: 'Guide', content: clean(result.message, 6000), phase: clean(result.phase, 80), directAccountability: clean(result.directAccountability, 1000), source: 'ai-generated', createdAt: FieldValue.serverTimestamp() });
  await ctx.sessionRef.set({ phase: clean(result.phase, 80) || ctx.session.phase, safetyFlag: result.safetyFlag === true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await writeLedger(ctx.coupleRef, { eventType: 'shared-session-turn', actorUid: uid, sessionId, visibility: 'shared', source: 'user-input', summary: `Shared session turn by ${speaker}` });
  return result;
}

async function privateCoach(uid, data) {
  const content = clean(data.content, 6000);
  if (!content) throw httpError(400, 'Enter a response.', 'content-required');
  const type = clean(data.type, 80) || 'private-reflection';
  const base = await userAndCouple(uid);
  const interactionRef = db().collection(`users/${uid}/privateInteractions`).doc();
  await interactionRef.set({
    type,
    content,
    context: clean(data.context, 1000),
    source: 'user-input',
    visibility: 'owner-only',
    createdAt: FieldValue.serverTimestamp(),
  });

  let dossier = {};
  let prompts = [];
  let partnerUid = null;
  if (base.coupleRef) {
    const [dossierSnap, promptSnap] = await Promise.all([
      base.coupleRef.collection('guide').doc('dossier').get(),
      db().collection(`users/${uid}/bridgePrompts`).orderBy('createdAt', 'desc').limit(10).get(),
    ]);
    dossier = dossierSnap.data()?.structured || {};
    prompts = promptSnap.docs.map(doc => doc.data());
    partnerUid = base.couple.memberUids.find(memberUid => memberUid !== uid) || null;
  }

  const result = await gemini(
    GUIDE_STANDARD,
    `Privately coach this member. Return JSON with response, themes array, safetyFlag boolean, and bridgeSignal object with useful boolean, theme, targetPrompt, suggestedExercise, confidence from 0 to 1, sensitivity. The bridge signal is for the partner's private experience. It must never quote, closely paraphrase, attribute, or reveal this input. It must be a neutral question or exercise that remains useful without knowing its source.\n\nCURRENT PRIVATE INPUT:\n${content}\n\nSHARED DOSSIER:\n${JSON.stringify(dossier)}\n\nSANITIZED PROMPTS FOR THIS USER:\n${JSON.stringify(prompts)}`,
  );

  await interactionRef.set({
    aiThemes: Array.isArray(result.themes) ? result.themes.slice(0, 8) : [],
    safetyFlag: result.safetyFlag === true,
    processedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const signal = result.bridgeSignal || {};
  if (base.coupleRef && partnerUid && signal.useful === true && clean(signal.targetPrompt, 1000)) {
    const expiresAt = Timestamp.fromMillis(Date.now() + 90 * 86400000);
    await db().collection(`users/${partnerUid}/bridgePrompts`).add({
      type: 'middleman-prompt',
      theme: clean(signal.theme, 120),
      prompt: clean(signal.targetPrompt, 1000),
      suggestedExercise: clean(signal.suggestedExercise, 1000),
      confidence: Math.max(0, Math.min(1, Number(signal.confidence) || 0.5)),
      sensitivity: clean(signal.sensitivity, 40),
      origin: 'ai-derived',
      status: 'active',
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
    });
    await base.coupleRef.collection('derivedSignals').add({
      type: 'bridge-created',
      targetUid: partnerUid,
      theme: clean(signal.theme, 120),
      origin: 'ai-derived',
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  if (base.coupleRef) {
    await writeLedger(base.coupleRef, {
      eventType: type,
      actorUid: uid,
      visibility: 'private-metadata-only',
      source: 'user-input',
      summary: `${type} completed`,
    });
  }
  return { response: result.response, themes: result.themes || [], safetyFlag: result.safetyFlag === true };
}

async function completeSession(uid, data) {
  const sessionId = clean(data.sessionId, 100);
  const ctx = await sessionContext(uid, sessionId);
  const result = await gemini(
    GUIDE_STANDARD,
    `Close this session honestly. Return JSON with resolutionStatus (resolved, partial, paused, unsafe), resolutionSummary, unresolved array, sharedHomework array of objects with title, instructions, dueDays, secretAssignments array with memberUid, assignment, internalReason, partnerObservationQuestion, fairnessNotes array, followUpTopic. Include exactly one safe secret assignment per member. A partner observation question must not reveal that an assignment existed.\n\nCONTEXT:\n${contextSummary(ctx)}`,
    2400,
  );

  const startedMs = ctx.session.startedAt?.toMillis?.() || Date.now();
  const elapsedMinutes = Math.max(
    1,
    Math.min(ctx.session.durationLimitMinutes || 90, Math.round((Date.now() - startedMs) / 60000)),
  );
  const costEstimate = {
    durationMinutes: elapsedMinutes,
    rateMinUsdPerHour: RATE_MIN,
    rateMaxUsdPerHour: RATE_MAX,
    estimatedMinUsd: Math.round(elapsedMinutes / 60 * RATE_MIN),
    estimatedMaxUsd: Math.round(elapsedMinutes / 60 * RATE_MAX),
    label: 'Estimated equivalent private-practice cost; not a bill.',
  };

  await ctx.sessionRef.set({
    status: 'completed',
    endedAt: FieldValue.serverTimestamp(),
    resolutionStatus: clean(result.resolutionStatus, 40),
    resolutionSummary: clean(result.resolutionSummary, 5000),
    unresolved: Array.isArray(result.unresolved) ? result.unresolved.slice(0, 10) : [],
    fairnessNotes: Array.isArray(result.fairnessNotes) ? result.fairnessNotes.slice(0, 10) : [],
    followUpTopic: clean(result.followUpTopic, 1000),
    costEstimate,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  for (const item of Array.isArray(result.sharedHomework) ? result.sharedHomework.slice(0, 6) : []) {
    await ctx.sessionRef.collection('sharedHomework').add({
      title: clean(item.title, 180),
      instructions: clean(item.instructions, 1500),
      dueAt: Timestamp.fromMillis(Date.now() + Math.max(1, Math.min(30, Number(item.dueDays) || 7)) * 86400000),
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  const assignments = Array.isArray(result.secretAssignments) ? result.secretAssignments : [];
  for (const memberUid of ctx.couple.memberUids || []) {
    const item = assignments.find(assignment => assignment.memberUid === memberUid) || {};
    await db().collection(`users/${memberUid}/secretAssignments`).add({
      sessionId,
      assignment: clean(item.assignment, 1500) || 'Practice one small, observable act of care before the next check-in.',
      internalReason: clean(item.internalReason, 1000),
      status: 'active',
      dueAt: Timestamp.fromMillis(Date.now() + 7 * 86400000),
      createdAt: FieldValue.serverTimestamp(),
    });
    const observerUid = ctx.couple.memberUids.find(value => value !== memberUid);
    if (observerUid) {
      await db().collection(`users/${observerUid}/bridgePrompts`).add({
        type: 'assignment-observation',
        theme: 'follow-up',
        prompt: clean(item.partnerObservationQuestion, 1000) || 'What positive or difficult change did you notice in your partner this week?',
        confidence: 1,
        origin: 'session-assignment',
        status: 'active',
        expiresAt: Timestamp.fromMillis(Date.now() + 21 * 86400000),
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }

  await writeLedger(ctx.coupleRef, {
    eventType: 'live-session-completed',
    actorUid: uid,
    sessionId,
    visibility: 'shared-summary',
    source: 'session',
    summary: clean(result.resolutionSummary, 500),
  });
  return { ...result, costEstimate };
}

const actions = { planSession, respond, privateCoach, completeSession };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { code: 'method-not-allowed', message: 'Use POST.' } });
  }
  return runWithGoogle(req, async () => {
    try {
      const token = await requireUser(req);
      const action = clean(req.body?.action, 80);
      const operation = actions[action];
      if (!operation) throw httpError(400, 'Unknown Guide action.', 'unknown-action');
      const data = await operation(token.uid, req.body?.data || {});
      return res.status(200).json({ data });
    } catch (error) {
      console.error('Guide API error:', error.code || error.message);
      return res.status(error.status || 500).json({
        error: {
          code: error.code || 'internal',
          message: error.status ? error.message : 'The Guide could not complete this request.',
        },
      });
    }
  });
}
