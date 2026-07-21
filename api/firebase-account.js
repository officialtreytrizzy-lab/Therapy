import { ExternalAccountClient } from 'google-auth-library';
import { AsyncLocalStorage } from 'node:async_hooks';
import { verify as verifySignature } from 'node:crypto';
import { FieldValue, Firestore, Timestamp } from '@google-cloud/firestore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'us-for-real-therapy';
const INVITE_TTL_DAYS = 7;
const FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let firebaseCertCache = { certificates: null, expiresAt: 0 };

const oidcContext = new AsyncLocalStorage();

function createGoogleExternalClient(subjectToken) {
  if (!subjectToken) throw new Error('The Vercel OIDC token is unavailable for this request.');
  const projectNumber = process.env.GCP_PROJECT_NUMBER || '71136345766';
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID || 'vercel';
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID || 'vercel';
  const serviceAccount = process.env.GCP_SERVICE_ACCOUNT_EMAIL || 'usfr-vercel-admin@us-for-real-therapy.iam.gserviceaccount.com';
  const client = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: async () => subjectToken },
  });
  if (!client) throw new Error('Could not initialize the Google workload-identity client.');
  return client;
}

function createFirestoreClient(subjectToken) {
  return new Firestore({
    projectId: PROJECT_ID,
    databaseId: '(default)',
    preferRest: true,
    maxIdleChannels: 0,
    auth: createGoogleExternalClient(subjectToken),
  });
}

function getDb() {
  const firestore = oidcContext.getStore()?.firestore;
  if (!firestore) throw new Error('Firestore is unavailable outside an authenticated Vercel request.');
  return firestore;
}

function clean(value, max = 500) {
  return value == null ? '' : String(value).trim().slice(0, max);
}

function arrayOfText(value, maxItems = 12, maxLength = 240) {
  return Array.isArray(value)
    ? value.map(item => clean(item, maxLength)).filter(Boolean).slice(0, maxItems)
    : [];
}

function httpError(status, message, code = 'request-failed') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function decodeJwtPart(value) {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw httpError(401, 'Your sign-in session is malformed.', 'invalid-token');
  }
}

async function getFirebaseCertificates() {
  if (firebaseCertCache.certificates && firebaseCertCache.expiresAt > Date.now() + 30_000) {
    return firebaseCertCache.certificates;
  }
  const response = await fetch(FIREBASE_CERTS_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) throw httpError(503, 'Firebase sign-in verification is temporarily unavailable.', 'certificates-unavailable');
  const certificates = await response.json();
  const cacheControl = response.headers.get('cache-control') || '';
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 3600);
  firebaseCertCache = {
    certificates,
    expiresAt: Date.now() + Math.max(300, maxAge) * 1000,
  };
  return certificates;
}

async function verifyFirebaseIdToken(idToken) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw httpError(401, 'Your sign-in session is malformed.', 'invalid-token');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtPart(encodedHeader);
  const payload = decodeJwtPart(encodedPayload);
  if (header.alg !== 'RS256' || !header.kid) throw httpError(401, 'Your sign-in session uses an unsupported signature.', 'invalid-token');
  const certificates = await getFirebaseCertificates();
  const certificate = certificates[header.kid];
  if (!certificate) {
    firebaseCertCache.expiresAt = 0;
    throw httpError(401, 'Your sign-in session was signed with an unknown key.', 'invalid-token');
  }
  const signedData = Buffer.from(`${encodedHeader}.${encodedPayload}`);
  const signature = Buffer.from(encodedSignature, 'base64url');
  if (!verifySignature('RSA-SHA256', signedData, certificate, signature)) {
    throw httpError(401, 'Your sign-in session signature is invalid.', 'invalid-token');
  }
  const now = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${PROJECT_ID}`;
  if (payload.aud !== PROJECT_ID || payload.iss !== expectedIssuer) {
    throw httpError(401, 'Your sign-in session belongs to another Firebase project.', 'invalid-token');
  }
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) {
    throw httpError(401, 'Your sign-in session has no valid user ID.', 'invalid-token');
  }
  if (!Number.isFinite(payload.exp) || payload.exp <= now || !Number.isFinite(payload.iat) || payload.iat > now + 60) {
    throw httpError(401, 'Your sign-in session is invalid or expired.', 'invalid-token');
  }
  if (payload.auth_time != null && (!Number.isFinite(payload.auth_time) || payload.auth_time > now + 60)) {
    throw httpError(401, 'Your sign-in time is invalid.', 'invalid-token');
  }
  return { ...payload, uid: payload.sub };
}

async function requireUser(req) {
  const authorization = req.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw httpError(401, 'Sign in is required.', 'unauthenticated');
  return verifyFirebaseIdToken(match[1]);
}

function randomMemberCode() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

async function provisionProfile(uid, token, data) {
  const userRef = getDb().doc(`users/${uid}`);
  return getDb().runTransaction(async transaction => {
    const existing = await transaction.get(userRef);
    if (existing.exists) return { memberCode: existing.data().memberCode, profile: existing.data() };

    let code;
    let directoryRef;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      code = randomMemberCode();
      directoryRef = getDb().doc(`memberDirectory/${code}`);
      if (!(await transaction.get(directoryRef)).exists) break;
      code = null;
    }
    if (!code || !directoryRef) throw httpError(503, 'Could not allocate a member ID. Try again.', 'member-id-unavailable');

    const profile = {
      uid,
      memberCode: code,
      displayName: clean(data.displayName || token.name || token.email?.split('@')[0] || 'Member', 80),
      pronouns: clean(data.pronouns, 40),
      email: token.email || null,
      photoURL: token.picture || null,
      relationshipStatus: 'solo',
      coupleId: null,
      onboardingComplete: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.create(userRef, profile);
    transaction.create(directoryRef, { uid, active: true, createdAt: FieldValue.serverTimestamp() });
    return { memberCode: code, profile };
  });
}

async function requestPartnerLink(uid, data) {
  const partnerCode = clean(data.partnerCode, 8);
  if (!/^\d{8}$/.test(partnerCode)) throw httpError(400, 'Enter the other member’s 8-digit ID.', 'invalid-member-id');
  const fromRef = getDb().doc(`users/${uid}`);
  const directoryRef = getDb().doc(`memberDirectory/${partnerCode}`);
  const inviteRef = getDb().collection('partnerInvites').doc();

  return getDb().runTransaction(async transaction => {
    const [fromSnap, directorySnap] = await Promise.all([transaction.get(fromRef), transaction.get(directoryRef)]);
    if (!fromSnap.exists) throw httpError(409, 'Finish account setup first.', 'profile-required');
    if (!directorySnap.exists || directorySnap.data().active !== true) throw httpError(404, 'No active member has that ID.', 'member-not-found');
    const toUid = directorySnap.data().uid;
    if (toUid === uid) throw httpError(400, 'You cannot link your own ID.', 'self-link');
    const toRef = getDb().doc(`users/${toUid}`);
    const toSnap = await transaction.get(toRef);
    if (!toSnap.exists) throw httpError(404, 'That member profile is unavailable.', 'member-not-found');
    const from = fromSnap.data();
    const to = toSnap.data();
    if (from.coupleId || from.relationshipStatus === 'linked') throw httpError(409, 'Your account is already linked.', 'already-linked');
    if (to.coupleId || to.relationshipStatus === 'linked') throw httpError(409, 'That member is already linked.', 'partner-linked');

    transaction.create(inviteRef, {
      fromUid: uid,
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
}

async function listPendingInvites(uid) {
  const [incoming, outgoing] = await Promise.all([
    getDb().collection('partnerInvites').where('toUid', '==', uid).where('status', '==', 'pending').limit(10).get(),
    getDb().collection('partnerInvites').where('fromUid', '==', uid).where('status', '==', 'pending').limit(10).get(),
  ]);
  const normalize = snapshot => snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return { incoming: normalize(incoming), outgoing: normalize(outgoing) };
}

async function respondToPartnerInvite(uid, data) {
  const inviteId = clean(data.inviteId, 100);
  const accept = data.accept === true;
  if (!inviteId) throw httpError(400, 'Invite ID is required.', 'invite-required');
  const inviteRef = getDb().doc(`partnerInvites/${inviteId}`);

  return getDb().runTransaction(async transaction => {
    const inviteSnap = await transaction.get(inviteRef);
    if (!inviteSnap.exists) throw httpError(404, 'Invite not found.', 'invite-not-found');
    const invite = inviteSnap.data();
    if (invite.toUid !== uid) throw httpError(403, 'This invite is not yours.', 'forbidden');
    if (invite.status !== 'pending') throw httpError(409, 'This invite is no longer pending.', 'invite-closed');
    if (invite.expiresAt?.toMillis?.() < Date.now()) {
      transaction.update(inviteRef, { status: 'expired', respondedAt: FieldValue.serverTimestamp() });
      throw httpError(410, 'This invite expired.', 'invite-expired');
    }

    const fromRef = getDb().doc(`users/${invite.fromUid}`);
    const toRef = getDb().doc(`users/${invite.toUid}`);
    const [fromSnap, toSnap] = await Promise.all([transaction.get(fromRef), transaction.get(toRef)]);
    if (!fromSnap.exists || !toSnap.exists) throw httpError(404, 'A member profile is missing.', 'profile-missing');

    if (!accept) {
      transaction.update(inviteRef, { status: 'declined', respondedAt: FieldValue.serverTimestamp() });
      transaction.update(fromRef, { relationshipStatus: 'solo', updatedAt: FieldValue.serverTimestamp() });
      return { accepted: false };
    }

    const from = fromSnap.data();
    const to = toSnap.data();
    if (from.coupleId || to.coupleId) throw httpError(409, 'One account is already linked.', 'already-linked');
    const coupleRef = getDb().collection('couples').doc();
    const memberUids = [invite.fromUid, invite.toUid].sort();
    transaction.create(coupleRef, {
      memberUids,
      status: 'active',
      anniversary: null,
      story: { whereMet: '', howMet: '', firstDate: '', firstImpression: '', favoriteSharedMemory: '' },
      strengths: [], sharedValues: [], rituals: [], hopes: [], currentPriorities: [],
      intakeVersion: 1,
      linkedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    for (const [memberUid, member] of [[invite.fromUid, from], [invite.toUid, to]]) {
      transaction.set(coupleRef.collection('members').doc(memberUid), {
        uid: memberUid,
        memberCode: member.memberCode,
        displayName: member.displayName,
        role: 'partner',
        joinedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(getDb().doc(`users/${memberUid}`), {
        coupleId: coupleRef.id,
        relationshipStatus: 'linked',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.update(inviteRef, { status: 'accepted', coupleId: coupleRef.id, respondedAt: FieldValue.serverTimestamp() });
    return { accepted: true, coupleId: coupleRef.id };
  });
}

async function savePersonalIntake(uid, data) {
  await getDb().doc(`users/${uid}`).set({
    personalIntake: {
      loveLanguage: clean(data.loveLanguage, 80),
      conflictStyle: clean(data.conflictStyle, 120),
      stressSigns: clean(data.stressSigns, 500),
      repairPreferences: clean(data.repairPreferences, 500),
      communicationNeeds: clean(data.communicationNeeds, 500),
      funFacts: arrayOfText(data.funFacts, 10, 160),
      updatedAt: FieldValue.serverTimestamp(),
    },
    onboardingComplete: true,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true };
}

function dateText(value) {
  if (!value) return 'Not provided';
  const date = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Not provided' : date.toISOString().slice(0, 10);
}

function listText(values) {
  return Array.isArray(values) && values.length ? values.map(value => `- ${value}`).join('\n') : '- Not established yet';
}

async function rebuildDossier(coupleId) {
  const coupleRef = getDb().doc(`couples/${coupleId}`);
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
  const names = members.map(member => member.displayName).filter(Boolean);

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
    activeGoals: goals.map(goal => ({ title: goal.title, description: goal.description, progress: goal.progress })),
    activeAgreements: agreements.map(agreement => ({ title: agreement.title, terms: agreement.terms })),
    recentSharedMemories: memories.map(memory => ({ title: memory.title, content: memory.content, category: memory.category })),
    recentSessions: sessions.map(session => ({
      type: session.type, topic: session.topic, status: session.status, summary: session.summary,
      progressSignals: session.progressSignals || [], concerns: session.concerns || [],
    })),
  };

  const story = couple.story || {};
  const markdown = `# Couple Guide Dossier\n\n` +
    `> Living context for the Guide. Treat this as revisable evidence, not unquestionable truth. Recent direct statements override stale notes.\n\n` +
    `## Couple identity\n- Couple ID: ${coupleId}\n- Members: ${names.join(' & ') || 'Not established'}\n- Anniversary: ${structured.anniversary}\n\n` +
    `## Their story\n- Where they met: ${story.whereMet || 'Not provided'}\n- How they met: ${story.howMet || 'Not provided'}\n- First date: ${story.firstDate || 'Not provided'}\n- First impressions: ${story.firstImpression || 'Not provided'}\n- Favorite shared memory: ${story.favoriteSharedMemory || 'Not provided'}\n\n` +
    `## Strengths\n${listText(couple.strengths)}\n\n## Shared values\n${listText(couple.sharedValues)}\n\n` +
    `## Rituals and connection habits\n${listText(couple.rituals)}\n\n## Hopes\n${listText(couple.hopes)}\n\n` +
    `## Current priorities\n${listText(couple.currentPriorities)}\n\n` +
    `## Active goals\n${listText(goals.map(goal => `${goal.title}: ${goal.description || ''} (${goal.progress || 0}% complete)`))}\n\n` +
    `## Active agreements\n${listText(agreements.map(agreement => `${agreement.title}: ${agreement.terms || ''}`))}\n\n` +
    `## Recent shared memories\n${listText(memories.map(memory => `${memory.title}: ${memory.content || ''}`))}\n\n` +
    `## Recent session evidence\n${listText(sessions.map(session => `${session.topic || session.type}: ${session.summary || 'No summary yet'}`))}\n\n` +
    `## Guide use rules\n- Never treat an inference as a fact.\n- Verify conflicting or outdated details with the couple.\n- Never reveal one partner’s private reflection to the other.\n- Use this dossier to personalize questions, examples, exercises, and follow-up.\n- Track progress and setbacks without shaming either partner.\n- Equal dignity does not require equal responsibility.\n`;

  await coupleRef.collection('guide').doc('dossier').set({
    markdown,
    structured,
    version: FieldValue.increment(1),
    sourceCounts: { members: members.length, sessions: sessions.length, goals: goals.length, agreements: agreements.length, memories: memories.length },
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}


function stableDocumentId(value, index) {
  const cleaned = clean(value, 100).replace(/[^A-Za-z0-9_-]/g, '_');
  return cleaned || `item_${index}`;
}

async function replaceRelationshipCollection(coupleRef, collectionName, items) {
  const collection = coupleRef.collection(collectionName);
  const existing = await collection.get();
  const incomingIds = new Set(items.map((item, index) => stableDocumentId(item.id, index)));
  const writes = [];
  for (const document of existing.docs) {
    if (!incomingIds.has(document.id)) writes.push({ type: 'delete', ref: document.ref });
  }
  items.forEach((item, index) => {
    const id = stableDocumentId(item.id, index);
    writes.push({ type: 'set', ref: collection.doc(id), data: { ...item, id, updatedAt: FieldValue.serverTimestamp() } });
  });
  for (let offset = 0; offset < writes.length; offset += 450) {
    const batch = getDb().batch();
    for (const write of writes.slice(offset, offset + 450)) {
      if (write.type === 'delete') batch.delete(write.ref);
      else batch.set(write.ref, write.data, { merge: true });
    }
    await batch.commit();
  }
}

async function syncRelationshipState(uid, data) {
  const userSnap = await getDb().doc(`users/${uid}`).get();
  const coupleId = userSnap.data()?.coupleId;
  if (!coupleId) return { ok: true, mode: 'solo', synced: false };
  const coupleRef = getDb().doc(`couples/${coupleId}`);
  const coupleSnap = await coupleRef.get();
  if (!coupleSnap.exists || !coupleSnap.data().memberUids?.includes(uid)) {
    throw httpError(403, 'Couple access denied.', 'forbidden');
  }

  const sessions = (Array.isArray(data.sessions) ? data.sessions : [])
    .filter(session => clean(session.type, 80) !== 'private_coaching')
    .slice(0, 30)
    .map((session, index) => ({
      id: stableDocumentId(session.id, index),
      type: clean(session.type, 80),
      topic: clean(session.topic, 500),
      status: ['active', 'completed', 'paused'].includes(session.status) ? session.status : 'completed',
      summary: clean(session.summary, 4000),
      emotionalIntensity: Number.isFinite(Number(session.intensity)) ? Math.max(1, Math.min(10, Number(session.intensity))) : null,
      progressSignals: arrayOfText(session.progressSignals, 12, 240),
      concerns: arrayOfText(session.concerns, 12, 240),
      createdAtClient: clean(session.createdAt, 80),
      syncedBy: uid,
    }));

  const goals = (Array.isArray(data.goals) ? data.goals : []).slice(0, 30).map((goal, index) => ({
    id: stableDocumentId(goal.id, index),
    title: clean(goal.title, 180),
    description: clean(goal.description, 1000),
    category: clean(goal.category, 100),
    progress: Number.isFinite(Number(goal.progress)) ? Math.max(0, Math.min(100, Number(goal.progress))) : 0,
    status: goal.status === 'completed' ? 'completed' : 'active',
    targetDateClient: clean(goal.targetDate, 80),
    syncedBy: uid,
  }));

  const agreements = (Array.isArray(data.agreements) ? data.agreements : []).slice(0, 30).map((agreement, index) => ({
    id: stableDocumentId(agreement.id, index),
    title: clean(agreement.title, 180),
    terms: clean(agreement.terms, 2000),
    status: agreement.status === 'inactive' ? 'inactive' : 'active',
    reviewDateClient: clean(agreement.reviewDate, 80),
    syncedBy: uid,
  }));

  const memories = (Array.isArray(data.memories) ? data.memories : [])
    .filter(memory => memory.scope === 'shared')
    .slice(0, 40)
    .map((memory, index) => ({
      id: stableDocumentId(memory.id, index),
      title: clean(memory.title, 180),
      content: clean(memory.content, 2000),
      category: clean(memory.category, 100),
      sensitivity: ['low', 'medium', 'high'].includes(memory.sensitivity) ? memory.sensitivity : 'low',
      scope: 'shared',
      syncedBy: uid,
    }));

  await Promise.all([
    replaceRelationshipCollection(coupleRef, 'sessions', sessions),
    replaceRelationshipCollection(coupleRef, 'goals', goals),
    replaceRelationshipCollection(coupleRef, 'agreements', agreements),
    replaceRelationshipCollection(coupleRef, 'sharedMemories', memories),
  ]);
  await coupleRef.set({ lastProgressSyncAt: FieldValue.serverTimestamp(), lastProgressSyncBy: uid }, { merge: true });
  await rebuildDossier(coupleId);
  return {
    ok: true,
    mode: 'couple',
    coupleId,
    synced: true,
    counts: { sessions: sessions.length, goals: goals.length, agreements: agreements.length, memories: memories.length },
  };
}

async function saveCoupleIntake(uid, data) {
  const userSnap = await getDb().doc(`users/${uid}`).get();
  const coupleId = userSnap.data()?.coupleId;
  if (!coupleId) throw httpError(409, 'Link a partner before completing couple intake.', 'couple-required');
  const coupleRef = getDb().doc(`couples/${coupleId}`);
  const coupleSnap = await coupleRef.get();
  if (!coupleSnap.exists || !coupleSnap.data().memberUids?.includes(uid)) throw httpError(403, 'Couple access denied.', 'forbidden');
  let anniversary = null;
  if (data.anniversary) {
    const date = new Date(data.anniversary);
    if (Number.isNaN(date.valueOf())) throw httpError(400, 'Enter a valid anniversary date.', 'invalid-date');
    anniversary = Timestamp.fromDate(date);
  }
  await coupleRef.set({
    anniversary,
    story: {
      whereMet: clean(data.whereMet, 240), howMet: clean(data.howMet, 800),
      firstDate: clean(data.firstDate, 500), firstImpression: clean(data.firstImpression, 500),
      favoriteSharedMemory: clean(data.favoriteSharedMemory, 800),
    },
    strengths: arrayOfText(data.strengths),
    sharedValues: arrayOfText(data.sharedValues),
    rituals: arrayOfText(data.rituals, 12, 180),
    hopes: arrayOfText(data.hopes),
    currentPriorities: arrayOfText(data.currentPriorities, 8, 240),
    intakeVersion: FieldValue.increment(1),
    intakeUpdatedBy: uid,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await rebuildDossier(coupleId);
  return { ok: true, coupleId };
}

async function getGuideContext(uid) {
  const userSnap = await getDb().doc(`users/${uid}`).get();
  const user = userSnap.data();
  if (!user?.coupleId) return { mode: 'solo', personalIntake: user?.personalIntake || {}, dossier: null };
  const coupleSnap = await getDb().doc(`couples/${user.coupleId}`).get();
  if (!coupleSnap.exists || !coupleSnap.data().memberUids?.includes(uid)) throw httpError(403, 'Couple access denied.', 'forbidden');
  const dossierSnap = await getDb().doc(`couples/${user.coupleId}/guide/dossier`).get();
  return { mode: 'couple', coupleId: user.coupleId, dossier: dossierSnap.exists ? dossierSnap.data() : null };
}

const actions = {
  provisionProfile: (uid, token, data) => provisionProfile(uid, token, data),
  requestPartnerLink: (uid, _token, data) => requestPartnerLink(uid, data),
  listPendingInvites: uid => listPendingInvites(uid),
  respondToPartnerInvite: (uid, _token, data) => respondToPartnerInvite(uid, data),
  savePersonalIntake: (uid, _token, data) => savePersonalIntake(uid, data),
  saveCoupleIntake: (uid, _token, data) => saveCoupleIntake(uid, data),
  syncRelationshipState: (uid, _token, data) => syncRelationshipState(uid, data),
  getGuideContext: uid => getGuideContext(uid),
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method-not-allowed', message: 'Use POST.' } });
  const oidcToken = req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  const firestore = createFirestoreClient(oidcToken);
  return oidcContext.run({ token: oidcToken, firestore }, async () => {
  try {
    const token = await requireUser(req);
    const action = clean(req.body?.action, 80);
    const operation = actions[action];
    if (!operation) throw httpError(400, 'Unknown account action.', 'unknown-action');
    const result = await operation(token.uid, token, req.body?.data || {});
    return res.status(200).json({ data: result });
  } catch (error) {
    console.error('Firebase account API error:', error.code || error.message);
    return res.status(error.status || 500).json({
      error: { code: error.code || 'internal', message: error.status ? error.message : 'The account service could not complete this request.' },
    });
  }
  });
}
