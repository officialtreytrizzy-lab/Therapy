'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();
const REGION = 'us-central1';
const MEMBER_ID_MIN = 10000000;
const MEMBER_ID_MAX = 99999999;
const INVITE_TTL_DAYS = 7;
const CALLABLE_OPTIONS = { region: REGION, enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };

function requireAuth(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
  return uid;
}

function text(value, max = 500) {
  if (value == null) return '';
  return String(value).trim().slice(0, max);
}

function nullableDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) throw new HttpsError('invalid-argument', 'Invalid date.');
  return Timestamp.fromDate(d);
}

function randomMemberCode() {
  return String(Math.floor(MEMBER_ID_MIN + Math.random() * (MEMBER_ID_MAX - MEMBER_ID_MIN + 1)));
}

async function allocateMemberCode(transaction) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = randomMemberCode();
    const ref = db.doc(`memberDirectory/${code}`);
    const snap = await transaction.get(ref);
    if (!snap.exists) return { code, ref };
  }
  throw new HttpsError('resource-exhausted', 'Could not allocate a member ID. Try again.');
}

exports.provisionProfile = onCall(CALLABLE_OPTIONS, async request => {
  const uid = requireAuth(request);
  const displayName = text(request.data?.displayName || request.auth.token.name || 'Member', 80);
  const pronouns = text(request.data?.pronouns, 40);
  const userRef = db.doc(`users/${uid}`);

  return db.runTransaction(async transaction => {
    const existing = await transaction.get(userRef);
    if (existing.exists) {
      const data = existing.data();
      return { memberCode: data.memberCode, profile: data };
    }

    const { code, ref: directoryRef } = await allocateMemberCode(transaction);
    const profile = {
      uid,
      memberCode: code,
      displayName,
      pronouns,
      email: request.auth.token.email || null,
      relationshipStatus: 'solo',
      coupleId: null,
      onboardingComplete: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    transaction.create(userRef, profile);
    transaction.create(directoryRef, {
      uid,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { memberCode: code, profile };
  });
});

exports.requestPartnerLink = onCall(CALLABLE_OPTIONS, async request => {
  const fromUid = requireAuth(request);
  const partnerCode = text(request.data?.partnerCode, 8);
  if (!/^\d{8}$/.test(partnerCode)) {
    throw new HttpsError('invalid-argument', 'Enter the other member’s 8-digit ID.');
  }

  const fromRef = db.doc(`users/${fromUid}`);
  const directoryRef = db.doc(`memberDirectory/${partnerCode}`);
  const inviteRef = db.collection('partnerInvites').doc();

  return db.runTransaction(async transaction => {
    const [fromSnap, directorySnap] = await Promise.all([
      transaction.get(fromRef),
      transaction.get(directoryRef),
    ]);
    if (!fromSnap.exists) throw new HttpsError('failed-precondition', 'Finish account setup first.');
    if (!directorySnap.exists || directorySnap.data().active !== true) {
      throw new HttpsError('not-found', 'No active member has that ID.');
    }

    const toUid = directorySnap.data().uid;
    if (toUid === fromUid) throw new HttpsError('invalid-argument', 'You cannot link your own ID.');
    const toRef = db.doc(`users/${toUid}`);
    const toSnap = await transaction.get(toRef);
    if (!toSnap.exists) throw new HttpsError('not-found', 'That member profile is unavailable.');

    const from = fromSnap.data();
    const to = toSnap.data();
    if (from.coupleId || from.relationshipStatus === 'linked') {
      throw new HttpsError('failed-precondition', 'Your account is already linked.');
    }
    if (to.coupleId || to.relationshipStatus === 'linked') {
      throw new HttpsError('failed-precondition', 'That member is already linked.');
    }

    transaction.create(inviteRef, {
      fromUid,
      toUid,
      fromMemberCode: from.memberCode,
      toMemberCode: to.memberCode,
      fromDisplayName: from.displayName,
      toDisplayName: to.displayName,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + INVITE_TTL_DAYS * 86400000),
    });
    transaction.update(fromRef, { relationshipStatus: 'pending', updatedAt: FieldValue.serverTimestamp() });
    return { inviteId: inviteRef.id, partnerDisplayName: to.displayName };
  });
});

exports.listPendingInvites = onCall(CALLABLE_OPTIONS, async request => {
  const uid = requireAuth(request);
  const [incoming, outgoing] = await Promise.all([
    db.collection('partnerInvites').where('toUid', '==', uid).where('status', '==', 'pending').limit(10).get(),
    db.collection('partnerInvites').where('fromUid', '==', uid).where('status', '==', 'pending').limit(10).get(),
  ]);
  const normalize = snap => snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return { incoming: normalize(incoming), outgoing: normalize(outgoing) };
});

exports.respondToPartnerInvite = onCall(CALLABLE_OPTIONS, async request => {
  const uid = requireAuth(request);
  const inviteId = text(request.data?.inviteId, 80);
  const accept = request.data?.accept === true;
  if (!inviteId) throw new HttpsError('invalid-argument', 'Invite ID is required.');

  const inviteRef = db.doc(`partnerInvites/${inviteId}`);
  return db.runTransaction(async transaction => {
    const inviteSnap = await transaction.get(inviteRef);
    if (!inviteSnap.exists) throw new HttpsError('not-found', 'Invite not found.');
    const invite = inviteSnap.data();
    if (invite.toUid !== uid) throw new HttpsError('permission-denied', 'This invite is not yours.');
    if (invite.status !== 'pending') throw new HttpsError('failed-precondition', 'This invite is no longer pending.');
    if (invite.expiresAt?.toMillis?.() < Date.now()) {
      transaction.update(inviteRef, { status: 'expired', respondedAt: FieldValue.serverTimestamp() });
      throw new HttpsError('deadline-exceeded', 'This invite expired.');
    }

    const fromRef = db.doc(`users/${invite.fromUid}`);
    const toRef = db.doc(`users/${invite.toUid}`);
    const [fromSnap, toSnap] = await Promise.all([transaction.get(fromRef), transaction.get(toRef)]);
    if (!fromSnap.exists || !toSnap.exists) throw new HttpsError('not-found', 'A member profile is missing.');

    if (!accept) {
      transaction.update(inviteRef, { status: 'declined', respondedAt: FieldValue.serverTimestamp() });
      transaction.update(fromRef, { relationshipStatus: 'solo', updatedAt: FieldValue.serverTimestamp() });
      return { accepted: false };
    }

    const from = fromSnap.data();
    const to = toSnap.data();
    if (from.coupleId || to.coupleId) throw new HttpsError('failed-precondition', 'One account is already linked.');

    const coupleRef = db.collection('couples').doc();
    const memberUids = [invite.fromUid, invite.toUid].sort();
    transaction.create(coupleRef, {
      memberUids,
      status: 'active',
      anniversary: null,
      story: {
        whereMet: '',
        howMet: '',
        firstDate: '',
        firstImpression: '',
        favoriteSharedMemory: '',
      },
      strengths: [],
      sharedValues: [],
      rituals: [],
      hopes: [],
      currentPriorities: [],
      intakeVersion: 1,
      linkedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(coupleRef.collection('members').doc(invite.fromUid), {
      uid: invite.fromUid,
      memberCode: from.memberCode,
      displayName: from.displayName,
      role: 'partner',
      joinedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(coupleRef.collection('members').doc(invite.toUid), {
      uid: invite.toUid,
      memberCode: to.memberCode,
      displayName: to.displayName,
      role: 'partner',
      joinedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(fromRef, {
      coupleId: coupleRef.id,
      relationshipStatus: 'linked',
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(toRef, {
      coupleId: coupleRef.id,
      relationshipStatus: 'linked',
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(inviteRef, {
      status: 'accepted',
      coupleId: coupleRef.id,
      respondedAt: FieldValue.serverTimestamp(),
    });
    return { accepted: true, coupleId: coupleRef.id };
  });
});

exports.savePersonalIntake = onCall(CALLABLE_OPTIONS, async request => {
  const uid = requireAuth(request);
  const ref = db.doc(`users/${uid}`);
  const payload = request.data || {};
  const intake = {
    loveLanguage: text(payload.loveLanguage, 80),
    conflictStyle: text(payload.conflictStyle, 120),
    stressSigns: text(payload.stressSigns, 500),
    repairPreferences: text(payload.repairPreferences, 500),
    communicationNeeds: text(payload.communicationNeeds, 500),
    funFacts: Array.isArray(payload.funFacts) ? payload.funFacts.map(v => text(v, 160)).filter(Boolean).slice(0, 10) : [],
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set({ personalIntake: intake, onboardingComplete: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

exports.saveCoupleIntake = onCall(CALLABLE_OPTIONS, async request => {
  const uid = requireAuth(request);
  const userSnap = await db.doc(`users/${uid}`).get();
  const coupleId = userSnap.data()?.coupleId;
  if (!coupleId) throw new HttpsError('failed-precondition', 'Link a partner before completing couple intake.');
  const coupleRef = db.doc(`couples/${coupleId}`);
  const coupleSnap = await coupleRef.get();
  const couple = coupleSnap.data();
  if (!coupleSnap.exists || !couple.memberUids?.includes(uid)) throw new HttpsError('permission-denied', 'Couple access denied.');

  const payload = request.data || {};
  const update = {
    anniversary: nullableDate(payload.anniversary),
    story: {
      whereMet: text(payload.whereMet, 240),
      howMet: text(payload.howMet, 800),
      firstDate: text(payload.firstDate, 500),
      firstImpression: text(payload.firstImpression, 500),
      favoriteSharedMemory: text(payload.favoriteSharedMemory, 800),
    },
    strengths: Array.isArray(payload.strengths) ? payload.strengths.map(v => text(v, 120)).filter(Boolean).slice(0, 12) : [],
    sharedValues: Array.isArray(payload.sharedValues) ? payload.sharedValues.map(v => text(v, 120)).filter(Boolean).slice(0, 12) : [],
    rituals: Array.isArray(payload.rituals) ? payload.rituals.map(v => text(v, 180)).filter(Boolean).slice(0, 12) : [],
    hopes: Array.isArray(payload.hopes) ? payload.hopes.map(v => text(v, 240)).filter(Boolean).slice(0, 12) : [],
    currentPriorities: Array.isArray(payload.currentPriorities) ? payload.currentPriorities.map(v => text(v, 240)).filter(Boolean).slice(0, 8) : [],
    intakeVersion: FieldValue.increment(1),
    intakeUpdatedBy: uid,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await coupleRef.set(update, { merge: true });
  await rebuildDossier(coupleId);
  return { ok: true, coupleId };
});

exports.getGuideContext = onCall(CALLABLE_OPTIONS, async request => {
  const uid = requireAuth(request);
  const userSnap = await db.doc(`users/${uid}`).get();
  const user = userSnap.data();
  if (!user?.coupleId) {
    return { mode: 'solo', personalIntake: user?.personalIntake || {}, dossier: null };
  }
  const coupleSnap = await db.doc(`couples/${user.coupleId}`).get();
  if (!coupleSnap.exists || !coupleSnap.data().memberUids?.includes(uid)) {
    throw new HttpsError('permission-denied', 'Couple access denied.');
  }
  const dossierSnap = await db.doc(`couples/${user.coupleId}/guide/dossier`).get();
  return {
    mode: 'couple',
    coupleId: user.coupleId,
    dossier: dossierSnap.exists ? dossierSnap.data() : null,
  };
});

function listText(values) {
  return Array.isArray(values) && values.length ? values.map(v => `- ${v}`).join('\n') : '- Not established yet';
}

function dateText(value) {
  if (!value) return 'Not provided';
  const date = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Not provided' : date.toISOString().slice(0, 10);
}

async function rebuildDossier(coupleId) {
  const coupleRef = db.doc(`couples/${coupleId}`);
  const [coupleSnap, membersSnap, sessionsSnap, goalsSnap, agreementsSnap, memoriesSnap] = await Promise.all([
    coupleRef.get(),
    coupleRef.collection('members').get(),
    coupleRef.collection('sessions').orderBy('updatedAt', 'desc').limit(12).get(),
    coupleRef.collection('goals').where('status', '==', 'active').limit(12).get(),
    coupleRef.collection('agreements').where('status', '==', 'active').limit(12).get(),
    coupleRef.collection('sharedMemories').orderBy('updatedAt', 'desc').limit(20).get(),
  ]);
  if (!coupleSnap.exists) return;
  const couple = coupleSnap.data();
  const members = membersSnap.docs.map(doc => doc.data());
  const sessions = sessionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const goals = goalsSnap.docs.map(doc => doc.data());
  const agreements = agreementsSnap.docs.map(doc => doc.data());
  const memories = memoriesSnap.docs.map(doc => doc.data());

  const names = members.map(m => m.displayName).filter(Boolean);
  const structured = {
    coupleId,
    memberUids: couple.memberUids || [],
    memberNames: names,
    anniversary: dateText(couple.anniversary),
    story: couple.story || {},
    strengths: couple.strengths || [],
    sharedValues: couple.sharedValues || [],
    rituals: couple.rituals || [],
    hopes: couple.hopes || [],
    currentPriorities: couple.currentPriorities || [],
    activeGoals: goals.map(g => ({ title: g.title, description: g.description, progress: g.progress })),
    activeAgreements: agreements.map(a => ({ title: a.title, terms: a.terms })),
    recentSharedMemories: memories.map(m => ({ title: m.title, content: m.content, category: m.category })),
    recentSessions: sessions.map(s => ({
      type: s.type,
      topic: s.topic,
      status: s.status,
      summary: s.summary,
      progressSignals: s.progressSignals || [],
      concerns: s.concerns || [],
    })),
  };

  const markdown = `# Couple Guide Dossier\n\n` +
    `> Living context for the Guide. Treat this as revisable evidence, not unquestionable truth. Recent direct statements override stale notes.\n\n` +
    `## Couple identity\n- Couple ID: ${coupleId}\n- Members: ${names.join(' & ') || 'Not established'}\n- Anniversary: ${structured.anniversary}\n\n` +
    `## Their story\n- Where they met: ${couple.story?.whereMet || 'Not provided'}\n- How they met: ${couple.story?.howMet || 'Not provided'}\n- First date: ${couple.story?.firstDate || 'Not provided'}\n- First impressions: ${couple.story?.firstImpression || 'Not provided'}\n- Favorite shared memory: ${couple.story?.favoriteSharedMemory || 'Not provided'}\n\n` +
    `## Strengths\n${listText(couple.strengths)}\n\n` +
    `## Shared values\n${listText(couple.sharedValues)}\n\n` +
    `## Rituals and connection habits\n${listText(couple.rituals)}\n\n` +
    `## Hopes and priorities\n${listText(couple.hopes)}\n\nCurrent priorities:\n${listText(couple.currentPriorities)}\n\n` +
    `## Active goals\n${listText(goals.map(g => `${g.title}: ${g.description || ''} (${g.progress || 0}% complete)`))}\n\n` +
    `## Active agreements\n${listText(agreements.map(a => `${a.title}: ${a.terms || ''}`))}\n\n` +
    `## Recent shared memories\n${listText(memories.map(m => `${m.title}: ${m.content || ''}`))}\n\n` +
    `## Recent session evidence\n${listText(sessions.map(s => `${s.topic || s.type}: ${s.summary || 'No summary yet'}`))}\n\n` +
    `## Guide use rules\n- Never treat an inference as a fact.\n- Verify conflicting or outdated details with the couple.\n- Do not reveal one partner’s private reflection to the other.\n- Use the dossier to personalize questions, examples, exercises, and follow-up.\n- Track progress and setbacks without shaming either partner.\n- Equal dignity does not require equal responsibility.\n`;

  await coupleRef.collection('guide').doc('dossier').set({
    markdown,
    structured,
    version: FieldValue.increment(1),
    sourceCounts: {
      members: members.length,
      sessions: sessions.length,
      goals: goals.length,
      agreements: agreements.length,
      memories: memories.length,
    },
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

exports.refreshDossierOnCoupleUpdate = onDocumentWritten({
  region: REGION,
  document: 'couples/{coupleId}',
}, async event => rebuildDossier(event.params.coupleId));

for (const [name, path] of Object.entries({
  refreshDossierOnSession: 'couples/{coupleId}/sessions/{docId}',
  refreshDossierOnGoal: 'couples/{coupleId}/goals/{docId}',
  refreshDossierOnAgreement: 'couples/{coupleId}/agreements/{docId}',
  refreshDossierOnMemory: 'couples/{coupleId}/sharedMemories/{docId}',
  refreshDossierOnMember: 'couples/{coupleId}/members/{docId}',
})) {
  exports[name] = onDocumentWritten({ region: REGION, document: path }, async event => rebuildDossier(event.params.coupleId));
}
