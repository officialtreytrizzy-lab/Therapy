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

function fallbackPlan(ctx) {
  const safetyGate = ctx.session.safetyConcern && ctx.session.safetyConcern !== 'none'
    ? 'Clarify immediate safety and whether joint work is appropriate before discussing the dispute.'
    : 'Confirm both members can participate without intimidation, interruption, or retaliation.';
  const modules = [
    ['arrive','Arrive and regulate','Lower activation before analysis.','Rate intensity from 1–10 and name what would help you stay present.','90-second grounding and readiness check.','Both members can listen and choose words deliberately.'],
    ['facts','Establish the facts','Separate observable events from interpretations.','What would a camera or message log confirm happened?','Facts-versus-story worksheet.','Each member can state the event without assigning motive.'],
    ['perspective-a','First perspective','Hear one member fully without rebuttal.','What did this moment mean to you, and what did it affect?','Two-minute protected turn and reflection.','The listener can summarize accurately.'],
    ['perspective-b','Second perspective','Hear the other member under the same conditions.','What did you experience, intend, fear, or need?','Switch roles and mirror.','The first speaker can summarize accurately.'],
    ['cycle','Map the interaction cycle','Identify how each protective move triggers the next.','What usually happens immediately before and after this pattern?','Trigger → reaction → meaning → counterreaction map.','Both recognize the cycle without false equal blame.'],
    ['accountability','Name fairness and impact','Identify what was unfair, harmful, avoidant, or reasonable based on direct evidence.','What responsibility belongs to each person, and what does not?','Intent-impact-accountability review.','Responsibility is specific and supported by evidence.'],
    ['repair','Build a repair or decision','Turn understanding into a concrete boundary, request, repair, or choice.','What specific action would make the next occurrence meaningfully different?','Impact-accountability-repair or needs-options-tradeoffs.','A realistic next step is stated and voluntarily accepted.'],
    ['follow-up','Homework and follow-up','Protect progress after the session.','What will each person practice, and when will you review it?','One-week experiment and confidence check.','The plan is observable, time-bounded, and safe.'],
  ].map(([id,title,purpose,prompt,exercise,completionSignal])=>({id,title,purpose,prompt,exercise,completionSignal}));
  return {
    title: ctx.session.topic || 'Guided Couple Session',
    objective: ctx.session.desiredOutcome || 'Reach a truthful understanding and a concrete next step.',
    safetyGate,
    openingPrompt: 'Before deciding who is right, name your current intensity and the one outcome you most need from this conversation.',
    resolutionTargets: ['Clarify the direct facts','Understand each perspective','Name supported accountability','Create a safe next step'],
    likelyChallenges: ['Defensiveness','Mind-reading','Debating intent before acknowledging impact'],
    modules,
    generationStatus: 'structured-fallback',
  };
}

function fallbackResponse(ctx, newestMessage) {
  const correction = explicitAccountabilityFallback(newestMessage);
  const observation = clean(newestMessage, 700);
  return {
    message: correction || `I hear that this is the position you are bringing into the room. Before the other person responds, separate the observable event from the conclusion you drew from it. In the moment you described, what impact do you believe your action had on your partner?`,
    phase: correction ? 'accountability' : 'clarify',
    directAccountability: correction,
    probeQuestion: correction ? 'What would taking responsibility look like without defending the behavior?' : 'What impact do you believe your action had on your partner?',
    exercise: { name: 'facts-impact-request', steps: ['Name the observable action','Name the impact','Name one fair alternative'] },
    safetyFlag: /threat|violence|afraid|forced|coerc/i.test(observation),
    resolutionMovement: 'Clarify impact and supported responsibility.',
    generationStatus: 'structured-fallback',
  };
}

function fallbackPrivateCoach(content) {
  return {
    response: 'Your reaction deserves careful attention, but the next useful step is to separate what directly happened from what you fear it means. Name the observable event, the feeling underneath your strongest reaction, the need or boundary involved, and one request you could make without assigning motive. Your raw wording remains private.',
    themes: [],
    safetyFlag: /threat|violence|afraid|forced|coerc/i.test(String(content)),
    bridgeSignal: { useful: false, theme: '', targetPrompt: '', suggestedExercise: '', confidence: 0, sensitivity: 'private' },
    generationStatus: 'structured-fallback',
  };
}

function fallbackCompletion(ctx) {
  const memberUids = ctx.couple.memberUids || [];
  return {
    resolutionStatus: 'partial',
    resolutionSummary: 'The session established the issue, each perspective, and the need for a concrete follow-up. A final resolution should not be claimed until both members confirm that the proposed boundary or repair is realistic and has been followed in practice.',
    unresolved: ['Confirm the exact repair or boundary in observable language','Review follow-through at the next check-in'],
    sharedHomework: [{ title: 'One-week repair experiment', instructions: 'Each member completes the specific action agreed in the session and records what helped or interfered. Review it together within seven days.', dueDays: 7 }],
    secretAssignments: memberUids.map((memberUid,index)=>({
      memberUid,
      assignment: index===0 ? 'Practice one direct request without explaining your partner’s motive.' : 'Practice reflecting one concern fully before defending your intention.',
      internalReason: 'Reinforce the communication skill identified in the session.',
      partnerObservationQuestion: 'What positive or difficult change did you notice in your partner’s communication this week?',
    })),
    fairnessNotes: [],
    followUpTopic: ctx.session.topic || 'Review the repair experiment',
    generationStatus: 'structured-fallback',
  };
}

async function planSession(uid, data) {
  const ctx = await sessionContext(uid, clean(data.sessionId, 100));
  await purgeExpired(ctx.coupleRef);
  let result;
  try {
    result = await gemini(
      GUIDE_STANDARD,
      `Build a serious progressive couple-session plan around the current topic. The plan may last ${ctx.session.durationLimitMinutes} minutes, but must adapt to safety and progress. Return JSON with title, objective, safetyGate, openingPrompt, resolutionTargets array, likelyChallenges array, and modules array of 6-10 concise objects with id, title, purpose, prompt, exercise, completionSignal.\n\nCONTEXT:\n${contextSummary(ctx)}`,
      3200,
    );
  } catch (error) {
    console.error('Guide plan fallback:', error.code || error.message);
    result = fallbackPlan(ctx);
  }
  await ctx.sessionRef.set({ plan: result, phase: 'planned', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return result;
}

function explicitAccountabilityFallback(message) {
  const value = String(message || '').toLowerCase();
  const firstPersonAdmission = /\b(i|we)\b/.test(value);
  if (!firstPersonAdmission) return '';
  if ((/private (messages?|phone|account|conversation)/.test(value) || /read (his|her|their) messages/.test(value)) && /(without permission|without consent|crossed .*privacy|wanted proof)/.test(value)) {
    return 'That was not fair. Reading a partner’s private messages without permission violates their privacy; being in a relationship does not remove the need for consent. A fair alternative is to name the concern directly, ask for an honest conversation, and agree on a clear privacy boundary.';
  }
  if (/\b(i|we) (lied|deceived|threatened|hit|shoved|forced|humiliated)\b/.test(value)) {
    return 'That approach was not fair or safe. Understanding the feeling behind it does not excuse the behavior. The next step is direct accountability, stopping the behavior, addressing its impact, and choosing a safer alternative.';
  }
  return '';
}

async function accountabilityAudit(ctx, newestMessage, draft) {
  const fallback = explicitAccountabilityFallback(newestMessage);
  if (fallback) return { requiresCorrection: true, correction: fallback };
  const audit = await gemini(
    GUIDE_STANDARD,
    `Audit only the newest direct statement and the shared session evidence for a fairness/accountability issue. Do not infer motives or diagnose. Return JSON with requiresCorrection boolean and correction string. Set requiresCorrection true only when direct evidence shows conduct or an expectation that is unfair, controlling, deceptive, dismissive, coercive, violating consent/privacy, or unsafe. When true, correction must begin with “That was not fair,” “That approach is not reasonable,” or “That behavior is not safe,” then explain why and give one concrete alternative. Draft response: \n${JSON.stringify(draft)}\nNewest statement: \n${newestMessage}\nShared context: \n${contextSummary(ctx)}`,
    1200,
  );
  return { requiresCorrection: audit.requiresCorrection === true, correction: clean(audit.correction, 1400) };
}

async function respond(uid, data) {
  const sessionId = clean(data.sessionId, 100);
  const message = clean(data.message, 6000);
  if (!message) throw httpError(400, 'Enter a response.', 'message-required');
  const ctx = await sessionContext(uid, sessionId);
  const speaker = ctx.members.find(member => member.uid === uid)?.displayName || ctx.user.displayName || 'Partner';
  await ctx.sessionRef.collection('turns').add({ role: 'user', authorUid: uid, speakerName: speaker, content: message, source: 'user-input', createdAt: FieldValue.serverTimestamp() });
  ctx.turns.push({ role: 'user', speakerName: speaker, content: message });
  let result;
  try {
    result = await gemini(
      GUIDE_STANDARD,
      `Respond to the newest shared-session turn. Return JSON with message, phase, directAccountability string or empty, probeQuestion one question or empty, exercise object or null, safetyFlag boolean, resolutionMovement string. If someone is wrong or unfair based on direct evidence, state it respectfully and explain the better alternative.\n\nCONTEXT:\n${contextSummary(ctx)}`,
    );
  } catch (error) {
    console.error('Guide response fallback:', error.code || error.message);
    result = fallbackResponse(ctx, message);
  }
  const audit = await accountabilityAudit(ctx, message, result);
  if (audit.requiresCorrection && audit.correction) {
    result.directAccountability = audit.correction;
    const existing = clean(result.message, 6000);
    if (!existing.toLowerCase().includes(audit.correction.toLowerCase().slice(0, 36))) {
      result.message = `${audit.correction}\n\n${existing}`.trim();
    }
  }
  await ctx.sessionRef.collection('turns').add({ role: 'guide', speakerName: 'Guide', content: clean(result.message, 6000), phase: clean(result.phase, 80), directAccountability: clean(result.directAccountability, 1400), source: 'ai-generated', createdAt: FieldValue.serverTimestamp() });
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

  let result;
  try {
    result = await gemini(
      GUIDE_STANDARD,
      `Privately coach this member. Return JSON with response, themes array, safetyFlag boolean, and bridgeSignal object with useful boolean, theme, targetPrompt, suggestedExercise, confidence from 0 to 1, sensitivity. The bridge signal is for the partner's private experience. It must never quote, closely paraphrase, attribute, or reveal this input. It must be a neutral question or exercise that remains useful without knowing its source.\n\nCURRENT PRIVATE INPUT:\n${content}\n\nSHARED DOSSIER:\n${JSON.stringify(dossier)}\n\nSANITIZED PROMPTS FOR THIS USER:\n${JSON.stringify(prompts)}`,
    );
  } catch (error) {
    console.error('Private Guide fallback:', error.code || error.message);
    result = fallbackPrivateCoach(content);
  }

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
  let result;
  try {
    result = await gemini(
      GUIDE_STANDARD,
      `Close this session honestly. Return JSON with resolutionStatus (resolved, partial, paused, unsafe), resolutionSummary, unresolved array, sharedHomework array of objects with title, instructions, dueDays, secretAssignments array with memberUid, assignment, internalReason, partnerObservationQuestion, fairnessNotes array, followUpTopic. Include exactly one safe secret assignment per member. A partner observation question must not reveal that an assignment existed.\n\nCONTEXT:\n${contextSummary(ctx)}`,
      3600,
    );
  } catch (error) {
    console.error('Guide completion fallback:', error.code || error.message);
    result = fallbackCompletion(ctx);
  }

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
