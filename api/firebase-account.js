import { ExternalAccountClient } from 'google-auth-library';
import { AsyncLocalStorage } from 'node:async_hooks';
import { verify as verifySignature } from 'node:crypto';
import { FieldValue, Firestore, Timestamp } from '@google-cloud/firestore';
import { audit, correlationId, enforceRateLimit, FEATURE_FLAGS, redactedLog, verifyAppCheck } from './security.js';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'us-for-real-therapy';
const INVITE_TTL_DAYS = 7;
const DELETE_GRACE_DAYS = 7;
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

function createFirestoreClient(googleClient) {
  return new Firestore({
    projectId: PROJECT_ID,
    databaseId: '(default)',
    preferRest: true,
    maxIdleChannels: 0,
    auth: googleClient,
  });
}

function getDb() {
  const firestore = oidcContext.getStore()?.firestore;
  if (!firestore) throw new Error('Firestore is unavailable outside an authenticated Vercel request.');
  return firestore;
}

async function contextGoogleAccessToken() {
  const client = oidcContext.getStore()?.google;
  const result = await client?.getAccessToken();
  const token = typeof result === 'string' ? result : result?.token;
  if (!token) throw new Error('Google access token is unavailable for this request.');
  return token;
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
    const current = existing.exists ? existing.data() : null;
    let code = /^\d{8}$/.test(String(current?.memberCode || '')) ? String(current.memberCode) : null;
    let directoryRef = null;

    if (code) {
      const candidateRef = getDb().doc(`memberDirectory/${code}`);
      const candidate = await transaction.get(candidateRef);
      if (!candidate.exists || candidate.data()?.uid === uid) directoryRef = candidateRef;
      else code = null;
    }

    if (!code) {
      for (let attempt = 0; attempt < 16; attempt += 1) {
        const candidateCode = randomMemberCode();
        const candidateRef = getDb().doc(`memberDirectory/${candidateCode}`);
        const candidate = await transaction.get(candidateRef);
        if (!candidate.exists) {
          code = candidateCode;
          directoryRef = candidateRef;
          break;
        }
      }
    }
    if (!code || !directoryRef) throw httpError(503, 'Could not allocate a member ID. Try again.', 'member-id-unavailable');

    const profile = {
      ...(current || {}),
      uid,
      memberCode: code,
      displayName: clean(data.displayName || current?.displayName || token.name || token.email?.split('@')[0] || 'Member', 80),
      pronouns: clean(data.pronouns || current?.pronouns, 40),
      email: token.email || current?.email || null,
      emailVerified: token.email_verified === true,
      authProvider: 'email-link',
      photoURL: token.picture || current?.photoURL || null,
      relationshipStatus: current?.relationshipStatus || 'solo',
      coupleId: current?.coupleId || null,
      relationshipSetupComplete: current?.relationshipSetupComplete === true,
      onboardingComplete: current?.onboardingComplete === true,
      dataPolicyVersion: Math.max(2, Number(current?.dataPolicyVersion || 0)),
    };

    transaction.set(userRef, {
      ...profile,
      ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      lastAuthenticatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: existing.exists });
    transaction.set(directoryRef, {
      uid,
      active: true,
      ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { memberCode: code, profile };
  });
}

async function isBlockedBetween(uidA, uidB) {
  const [aBlockedB, bBlockedA] = await Promise.all([
    getDb().doc(`users/${uidA}/blockList/${uidB}`).get(),
    getDb().doc(`users/${uidB}/blockList/${uidA}`).get(),
  ]);
  return (aBlockedB.exists && aBlockedB.data().active !== false)
    || (bBlockedA.exists && bBlockedA.data().active !== false);
}

async function requestPartnerLink(uid, data) {
  await enforceRateLimit(getDb(), `invite:user:${uid}`, 5, 3600);
  const partnerCode = clean(data.partnerCode, 8);
  if (!/^\d{8}$/.test(partnerCode)) throw httpError(400, 'Enter the other member’s 8-digit ID.', 'invalid-member-id');
  const fromRef = getDb().doc(`users/${uid}`);
  const directoryRef = getDb().doc(`memberDirectory/${partnerCode}`);
  const inviteRef = getDb().collection('partnerInvites').doc();

  // Enforce block list before opening a transaction so blocked members can never
  // send or receive a link request (relationship-safety requirement).
  const directoryPreview = await directoryRef.get();
  if (directoryPreview.exists && directoryPreview.data().uid && directoryPreview.data().uid !== uid) {
    if (await isBlockedBetween(uid, directoryPreview.data().uid)) {
      throw httpError(403, 'This member cannot be linked.', 'member-blocked');
    }
  }

  return getDb().runTransaction(async transaction => {
    const [fromSnap, directorySnap] = await Promise.all([transaction.get(fromRef), transaction.get(directoryRef)]);
    if (!fromSnap.exists) throw httpError(409, 'Finish account setup first.', 'profile-required');
    if (!directorySnap.exists || directorySnap.data().active !== true) throw httpError(404, 'No active member has that ID.', 'member-not-found');
    const toUid = directorySnap.data().uid;
    if (toUid === uid) throw httpError(400, 'You cannot link your own ID.', 'self-link');
    const toRef = getDb().doc(`users/${toUid}`);
    const [toSnap, fromBlocksTo, toBlocksFrom] = await Promise.all([
      transaction.get(toRef),
      transaction.get(getDb().doc(`users/${uid}/blockList/${toUid}`)),
      transaction.get(getDb().doc(`users/${toUid}/blockList/${uid}`)),
    ]);
    if (!toSnap.exists) throw httpError(404, 'That member profile is unavailable.', 'member-not-found');
    if ((fromBlocksTo.exists && fromBlocksTo.data().active !== false) || (toBlocksFrom.exists && toBlocksFrom.data().active !== false)) {
      throw httpError(403, 'This member cannot be linked.', 'member-blocked');
    }
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
    const [fromBlocks, toBlocks] = await Promise.all([
      transaction.get(getDb().doc(`users/${invite.fromUid}/blockList/${invite.toUid}`)),
      transaction.get(getDb().doc(`users/${invite.toUid}/blockList/${invite.fromUid}`)),
    ]);
    if ((fromBlocks.exists && fromBlocks.data().active !== false) || (toBlocks.exists && toBlocks.data().active !== false)) {
      transaction.update(inviteRef, { status: 'blocked', respondedAt: FieldValue.serverTimestamp() });
      throw httpError(403, 'This member cannot be linked.', 'member-blocked');
    }
    const coupleRef = getDb().collection('couples').doc();
    const memberUids = [invite.fromUid, invite.toUid].sort();
    transaction.create(coupleRef, {
      memberUids,
      status: 'active',
      anniversary: null,
      story: { whereMet: '', howMet: '', firstDate: '', firstImpression: '', favoriteSharedMemory: '' },
      strengths: [], sharedValues: [], rituals: [], hopes: [], currentPriorities: [],
      intakeVersion: 1,
      dataPolicyVersion: 2,
      interactionModel: 'privacy-separated',
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
        relationshipSetupComplete: true,
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
      loveLanguage: clean(data.loveLanguage, 120),
      conflictStyle: clean(data.conflictStyle, 300),
      stressSigns: clean(data.stressSigns, 1000),
      triggers: clean(data.triggers, 1200),
      shutdownSigns: clean(data.shutdownSigns, 1000),
      repairPreferences: clean(data.repairPreferences, 1200),
      communicationNeeds: clean(data.communicationNeeds, 1200),
      feelingHeard: clean(data.feelingHeard, 1000),
      boundaries: clean(data.boundaries, 1200),
      preferredPace: clean(data.preferredPace, 500),
      accountabilityPreference: clean(data.accountabilityPreference, 700),
      culturalContext: clean(data.culturalContext, 1000),
      privateNoShare: clean(data.privateNoShare, 1000),
      relationshipGoals: arrayOfText(data.relationshipGoals, 10, 240),
      funFacts: arrayOfText(data.funFacts, 10, 160),
      source: 'user-input',
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
  await purgeExpiredDerivedSignals(coupleRef).catch(() => 0);
  const [coupleSnap, membersSnap, liveSessionsSnap, legacySessionsSnap, goalsSnap, agreementsSnap, ledgerSnap] = await Promise.all([
    coupleRef.get(),
    coupleRef.collection('members').get(),
    coupleRef.collection('liveSessions').orderBy('updatedAt', 'desc').limit(20).get(),
    coupleRef.collection('sessions').orderBy('updatedAt', 'desc').limit(20).get(),
    coupleRef.collection('goals').where('status', '==', 'active').limit(30).get(),
    coupleRef.collection('agreements').where('status', '==', 'active').limit(30).get(),
    coupleRef.collection('interactionLedger').orderBy('createdAt', 'desc').limit(60).get(),
  ]);
  if (!coupleSnap.exists) return;
  const couple = coupleSnap.data();
  const members = membersSnap.docs.map(doc => doc.data());
  const liveSessions = liveSessionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const legacySessions = legacySessionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const goals = goalsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const agreements = agreementsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const ledger = ledgerSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const names = members.map(member => member.displayName).filter(Boolean);
  const story = couple.story || {};
  const directFacts = {
    anniversary: couple.anniversary ? dateText(couple.anniversary) : null,
    whereMet: clean(story.whereMet, 240) || null,
    howMet: clean(story.howMet, 800) || null,
    firstDate: clean(story.firstDate, 500) || null,
    firstImpression: clean(story.firstImpression, 500) || null,
    favoriteSharedMemory: clean(story.favoriteSharedMemory, 800) || null,
    strengths: arrayOfText(couple.strengths),
    sharedValues: arrayOfText(couple.sharedValues),
    rituals: arrayOfText(couple.rituals, 12, 180),
    hopes: arrayOfText(couple.hopes),
    currentPriorities: arrayOfText(couple.currentPriorities, 8, 240),
    relationshipPatterns: couple.relationshipPatterns || {},
  };
  const completedLiveSessions = liveSessions.filter(session => session.status === 'completed');
  const completedLegacySessions = legacySessions.filter(session => session.status === 'completed' && session.source !== 'demo');
  const structured = {
    coupleId,
    memberUids: couple.memberUids || [],
    memberNames: names,
    directSharedInput: directFacts,
    activeGoals: goals.map(goal => ({ id: goal.id, title: goal.title, description: goal.description, progress: goal.progress, source: 'user-input' })),
    activeAgreements: agreements.map(agreement => ({ id: agreement.id, title: agreement.title, terms: agreement.terms, source: 'user-input' })),
    recentSharedSessionEvidence: [...completedLiveSessions, ...completedLegacySessions].slice(0, 20).map(session => ({
      id: session.id,
      topic: session.topic,
      type: session.type,
      resolutionStatus: session.resolutionStatus || null,
      resolutionSummary: session.resolutionSummary || session.summary || null,
      unresolved: session.unresolved || [],
      fairnessNotes: session.fairnessNotes || [],
      source: 'shared-session',
    })),
    recentInteractionMetadata: ledger.map(event => ({
      id: event.id,
      eventType: event.eventType,
      sessionId: event.sessionId || null,
      visibility: event.visibility,
      summary: event.summary,
      source: event.source,
    })),
    sourcePolicy: {
      directUserInputIsPrimary: true,
      privateRawInputExcluded: true,
      partnerBridgePromptsExcluded: true,
      emptyFieldsOmitted: true,
      sessionHistoryWindow: 20,
    },
  };

  const sections = [];
  sections.push('# Couple Guide Dossier');
  sections.push('> Shared, revisable context built from direct couple input and shared app interactions. Private member wording is excluded. Current direct statements override older summaries.');
  sections.push(`## Couple identity
- Couple ID: ${coupleId}
- Members: ${names.join(' & ')}`);
  const storyLines = [
    directFacts.anniversary && `- Anniversary: ${directFacts.anniversary}`,
    directFacts.whereMet && `- Where they met: ${directFacts.whereMet}`,
    directFacts.howMet && `- How they met: ${directFacts.howMet}`,
    directFacts.firstDate && `- First date: ${directFacts.firstDate}`,
    directFacts.firstImpression && `- First impressions: ${directFacts.firstImpression}`,
    directFacts.favoriteSharedMemory && `- Favorite shared memory: ${directFacts.favoriteSharedMemory}`,
  ].filter(Boolean);
  if (storyLines.length) sections.push(`## Their story
${storyLines.join('\n')}`);
  if (directFacts.strengths.length) sections.push(`## Strengths
${directFacts.strengths.map(value => `- ${value}`).join('\n')}`);
  if (directFacts.sharedValues.length) sections.push(`## Shared values
${directFacts.sharedValues.map(value => `- ${value}`).join('\n')}`);
  if (directFacts.rituals.length) sections.push(`## Rituals
${directFacts.rituals.map(value => `- ${value}`).join('\n')}`);
  if (directFacts.hopes.length) sections.push(`## Hopes
${directFacts.hopes.map(value => `- ${value}`).join('\n')}`);
  if (directFacts.currentPriorities.length) sections.push(`## Current priorities
${directFacts.currentPriorities.map(value => `- ${value}`).join('\n')}`);
  if (goals.length) sections.push(`## Active goals
${goals.map(goal => `- ${goal.title}: ${goal.description || ''} (${goal.progress || 0}% complete)`).join('\n')}`);
  if (agreements.length) sections.push(`## Active agreements
${agreements.map(agreement => `- ${agreement.title}: ${agreement.terms || ''}`).join('\n')}`);
  const evidence = structured.recentSharedSessionEvidence.filter(item => item.resolutionSummary);
  if (evidence.length) sections.push(`## Recent shared-session evidence
${evidence.map(item => `- ${item.topic || item.type}: ${item.resolutionSummary}`).join('\n')}`);
  sections.push(`## Guide use rules\n- Current session input is primary; this dossier is secondary context.\n- Never treat an inference as a fact.\n- Verify conflicting or outdated details.\n- Never expose one member’s private reflection, answer, task, or assignment.\n- Be fair without forcing equal blame.\n- Use shared history to improve safety, relevance, follow-up, and accountability—not to predetermine the outcome.`);

  await coupleRef.collection('guide').doc('dossier').set({
    markdown: sections.join('\n\n'),
    structured,
    version: FieldValue.increment(1),
    sourceCounts: {
      members: members.length,
      directSharedFields: Object.values(directFacts).filter(value => Array.isArray(value) ? value.length : Boolean(value)).length,
      liveSessions: completedLiveSessions.length,
      legacySessions: completedLegacySessions.length,
      goals: goals.length,
      agreements: agreements.length,
      interactionEvents: ledger.length,
    },
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
      source: 'user-input',
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
    upsertOwnedCollection(coupleRef, 'sessions', uid, sessions),
    upsertOwnedCollection(coupleRef, 'goals', uid, goals),
    upsertOwnedCollection(coupleRef, 'agreements', uid, agreements),
    upsertOwnedCollection(coupleRef, 'sharedMemories', uid, memories),
  ]);
  await coupleRef.set({ lastProgressSyncAt: FieldValue.serverTimestamp(), lastProgressSyncBy: uid }, { merge: true });
  await writeInteractionLedger(coupleRef, { eventType: 'member-state-synced', actorUid: uid, visibility: 'shared-metadata', source: 'user-input', summary: 'Member app activity synchronized', metadata: { sessions: sessions.length, goals: goals.length, agreements: agreements.length, sharedMemories: memories.length } });
  await rebuildDossier(coupleId);
  return {
    ok: true,
    mode: 'couple',
    coupleId,
    synced: true,
    // Only memories the member explicitly scoped as "shared" are written here;
    // private-scoped memories never leave the member's own space.
    counts: { sessions: sessions.length, goals: goals.length, agreements: agreements.length, sharedMemoriesWritten: memories.length },
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
    relationshipPatterns: {
      recurringTopics: arrayOfText(data.recurringTopics, 12, 240),
      escalationPattern: clean(data.escalationPattern, 1800),
      successfulRepairs: clean(data.successfulRepairs, 1800),
      affectionPreferences: clean(data.affectionPreferences, 1200),
      currentStressors: arrayOfText(data.currentStressors, 12, 240),
      privacyAgreements: clean(data.privacyAgreements, 1200),
      sessionGoals: arrayOfText(data.sessionGoals, 10, 240),
      culturalContext: clean(data.culturalContext, 1200),
    },
    intakeSource: 'user-input',
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


async function completeRelationshipSetup(uid, data) {
  const mode = data.mode === 'partner' ? 'partner' : 'solo';
  const userRef = getDb().doc(`users/${uid}`);
  if (mode === 'solo') {
    await userRef.set({
      relationshipSetupComplete: true,
      relationshipStatus: 'solo',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { mode: 'solo', linked: false };
  }
  const result = await requestPartnerLink(uid, data);
  await userRef.set({ relationshipSetupComplete: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { mode: 'partner', linked: false, pending: true, ...result };
}

async function requireCouple(uid) {
  const userSnap = await getDb().doc(`users/${uid}`).get();
  const user = userSnap.data();
  if (!user?.coupleId) throw httpError(409, 'Link a partner before using a joint session.', 'couple-required');
  const coupleRef = getDb().doc(`couples/${user.coupleId}`);
  const coupleSnap = await coupleRef.get();
  if (!coupleSnap.exists || !coupleSnap.data().memberUids?.includes(uid)) {
    throw httpError(403, 'Couple access denied.', 'forbidden');
  }
  return { user, coupleId: user.coupleId, coupleRef, couple: coupleSnap.data() };
}

async function requireSessionWorkspace(uid, requestedScope = 'solo') {
  const userRef = getDb().doc(`users/${uid}`);
  const userSnap = await userRef.get();
  const user = userSnap.data();
  if (!user) throw httpError(404, 'Your member profile was not found.', 'profile-not-found');

  const scope = requestedScope === 'couple' ? 'couple' : 'solo';
  if (scope === 'couple') {
    const couple = await requireCouple(uid);
    return {
      ...couple,
      scope,
      ownerUid: null,
      containerRef: couple.coupleRef,
      sessionCollection: couple.coupleRef.collection('liveSessions'),
      memberUids: couple.couple.memberUids || [],
    };
  }

  return {
    user,
    coupleId: null,
    coupleRef: null,
    couple: null,
    scope,
    ownerUid: uid,
    containerRef: userRef,
    sessionCollection: userRef.collection('guidedSessions'),
    memberUids: [uid],
  };
}

function safeMinutes(value) {
  const minutes = Number(value);
  if (![30, 45, 60, 75, 90].includes(minutes)) return 60;
  return minutes;
}

async function writeInteractionLedger(coupleRef, event) {
  const ref = coupleRef.collection('interactionLedger').doc();
  await ref.set({
    eventType: clean(event.eventType, 80),
    actorUid: event.actorUid || null,
    sessionId: event.sessionId || null,
    source: event.source || 'user-input',
    visibility: event.visibility || 'shared-metadata',
    summary: clean(event.summary, 500),
    metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : {},
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

async function writeSessionLedger(workspace, event) {
  if (workspace.scope === 'couple') return writeInteractionLedger(workspace.coupleRef, event);
  const ref = workspace.containerRef.collection('interactionLedger').doc();
  await ref.set({
    eventType: clean(event.eventType, 80),
    actorUid: event.actorUid || workspace.ownerUid,
    sessionId: event.sessionId || null,
    source: event.source || 'user-input',
    visibility: 'owner-only',
    summary: clean(event.summary, 500),
    metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : {},
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

async function createLiveSession(uid, data) {
  await enforceRateLimit(getDb(), `session:user:${uid}`, 12, 86400);
  const requestedScope = data.scope === 'couple' ? 'couple' : 'solo';
  const workspace = await requireSessionWorkspace(uid, requestedScope);
  const topic = clean(data.topic, 500);
  const scenario = clean(data.scenario, 3000);
  const desiredOutcome = clean(data.desiredOutcome, 1000);
  if (!topic) throw httpError(400, 'Describe the topic for this session.', 'topic-required');
  const type = clean(data.type, 80) || 'custom_session';
  const durationLimitMinutes = safeMinutes(data.durationLimitMinutes);
  const ref = workspace.sessionCollection.doc();
  const solo = workspace.scope === 'solo';
  const participantStatus = Object.fromEntries(workspace.memberUids.map(memberUid => [
    memberUid,
    solo || memberUid === uid ? 'ready' : 'invited',
  ]));
  const session = {
    scope: workspace.scope,
    visibility: solo ? 'owner-only' : 'shared-couple',
    ownerUid: solo ? uid : null,
    coupleId: workspace.coupleId,
    memberUids: workspace.memberUids,
    createdBy: uid,
    type,
    custom: type === 'custom_session',
    topic,
    scenario,
    desiredOutcome,
    emotionalIntensity: Math.max(1, Math.min(10, Number(data.emotionalIntensity) || 5)),
    safetyConcern: clean(data.safetyConcern, 120),
    status: solo ? 'active' : 'waiting',
    phase: 'intake',
    resolutionStatus: 'not-started',
    durationLimitMinutes,
    maxDurationSeconds: durationLimitMinutes * 60,
    participantStatus,
    startedAt: null,
    endedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    estimatedRateMinUsd: 150,
    estimatedRateMaxUsd: 400,
  };
  await ref.create({
    ...session,
    startedAt: solo ? FieldValue.serverTimestamp() : null,
  });
  await writeSessionLedger(workspace, {
    eventType: solo ? 'solo-guided-session-created' : 'live-session-created',
    actorUid: uid,
    sessionId: ref.id,
    summary: topic,
    metadata: { type, durationLimitMinutes, scope: workspace.scope },
  });
  return {
    id: ref.id,
    ...session,
    startedAt: solo ? new Date().toISOString() : null,
  };
}

async function joinLiveSession(uid, data) {
  const workspace = await requireSessionWorkspace(uid, data.scope === 'couple' ? 'couple' : 'solo');
  const sessionId = clean(data.sessionId, 100);
  const ref = workspace.sessionCollection.doc(sessionId);
  return getDb().runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw httpError(404, 'Session not found.', 'session-not-found');
    const session = snap.data();
    if (!session.memberUids?.includes(uid)) throw httpError(403, 'Session access denied.', 'forbidden');
    const status = { ...(session.participantStatus || {}), [uid]: 'ready' };
    const allReady = (session.memberUids || []).every(memberUid => status[memberUid] === 'ready');
    const activate = allReady && session.status === 'waiting';
    transaction.update(ref, {
      participantStatus: status,
      status: activate ? 'active' : session.status,
      startedAt: activate && !session.startedAt ? FieldValue.serverTimestamp() : session.startedAt,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { id: sessionId, scope: workspace.scope, allReady, status: activate ? 'active' : session.status };
  });
}

async function heartbeatLiveSession(uid, data) {
  const workspace = await requireSessionWorkspace(uid, data.scope === 'couple' ? 'couple' : 'solo');
  const sessionId = clean(data.sessionId, 100);
  const sessionRef = workspace.sessionCollection.doc(sessionId);
  const snap = await sessionRef.get();
  if (!snap.exists || !snap.data().memberUids?.includes(uid)) throw httpError(404, 'Session not found.', 'session-not-found');
  await sessionRef.collection('presence').doc(uid).set({
    uid,
    state: clean(data.state, 40) || 'online',
    currentModule: clean(data.currentModule, 80),
    lastSeenAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true, scope: workspace.scope };
}

async function saveAssignmentFeedback(uid, data) {
  const assignmentId = clean(data.assignmentId, 100);
  if (!assignmentId) throw httpError(400, 'Assignment ID is required.', 'assignment-required');
  const assignmentRef = getDb().doc(`users/${uid}/secretAssignments/${assignmentId}`);
  const snap = await assignmentRef.get();
  if (!snap.exists) throw httpError(404, 'Assignment not found.', 'assignment-not-found');
  await assignmentRef.set({
    selfReflection: clean(data.selfReflection, 2000),
    completionRating: Math.max(0, Math.min(10, Number(data.completionRating) || 0)),
    completedAt: FieldValue.serverTimestamp(),
    status: 'completed',
  }, { merge: true });
  return { ok: true };
}

async function purgeExpiredDerivedSignals(coupleRef) {
  const now = Timestamp.now();
  const snapshot = await coupleRef.collection('derivedSignals').where('expiresAt', '<=', now).limit(200).get();
  if (snapshot.empty) return 0;
  const batch = getDb().batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  return snapshot.size;
}

async function upsertOwnedCollection(coupleRef, collectionName, uid, items) {
  const collection = coupleRef.collection(collectionName);
  const existing = await collection.where('syncedBy', '==', uid).get();
  const normalized = items.map((item, index) => ({
    ...item,
    id: `${uid}_${stableDocumentId(item.id, index)}`,
    syncedBy: uid,
  }));
  const incomingIds = new Set(normalized.map(item => item.id));
  const writes = [];
  existing.docs.forEach(doc => { if (!incomingIds.has(doc.id)) writes.push({ type: 'delete', ref: doc.ref }); });
  normalized.forEach(item => writes.push({
    type: 'set', ref: collection.doc(item.id),
    data: { ...item, updatedAt: FieldValue.serverTimestamp() },
  }));
  for (let offset = 0; offset < writes.length; offset += 450) {
    const batch = getDb().batch();
    writes.slice(offset, offset + 450).forEach(write => write.type === 'delete' ? batch.delete(write.ref) : batch.set(write.ref, write.data, { merge: true }));
    await batch.commit();
  }
}

async function refreshGuideDossier(uid) {
  const userSnap = await getDb().doc(`users/${uid}`).get();
  const coupleId = userSnap.data()?.coupleId;
  if (!coupleId) throw httpError(409, 'Link a partner before refreshing couple context.', 'couple-required');
  const coupleSnap = await getDb().doc(`couples/${coupleId}`).get();
  if (!coupleSnap.exists || !coupleSnap.data().memberUids?.includes(uid)) throw httpError(403, 'Couple access denied.', 'forbidden');
  await rebuildDossier(coupleId);
  const dossier = await getDb().doc(`couples/${coupleId}/guide/dossier`).get();
  return { coupleId, dossier: dossier.exists ? dossier.data() : null };
}


async function exportMyData(uid) {
  const userSnap = await getDb().doc(`users/${uid}`).get();
  if (!userSnap.exists) throw httpError(404, 'Your member profile was not found.', 'profile-not-found');
  const user = userSnap.data();
  const [privateInteractions, assignments, bridgePrompts, privateMemories, exercises, guidedSessions, privateLedger] = await Promise.all([
    getDb().collection(`users/${uid}/privateInteractions`).limit(500).get(),
    getDb().collection(`users/${uid}/secretAssignments`).limit(500).get(),
    getDb().collection(`users/${uid}/bridgePrompts`).limit(500).get(),
    getDb().collection(`users/${uid}/privateMemories`).limit(500).get(),
    getDb().collection(`users/${uid}/cloudExercises`).limit(500).get(),
    getDb().collection(`users/${uid}/guidedSessions`).limit(200).get(),
    getDb().collection(`users/${uid}/interactionLedger`).limit(500).get(),
  ]);
  let shared = null;
  if (user.coupleId) {
    const coupleRef = getDb().doc(`couples/${user.coupleId}`);
    const coupleSnap = await coupleRef.get();
    if (coupleSnap.exists && coupleSnap.data().memberUids?.includes(uid)) {
      const [ledger, sessions, agreements, goals, dossier] = await Promise.all([
        coupleRef.collection('interactionLedger').limit(500).get(),
        coupleRef.collection('liveSessions').limit(200).get(),
        coupleRef.collection('agreements').limit(200).get(),
        coupleRef.collection('goals').limit(200).get(),
        coupleRef.collection('guide').doc('dossier').get(),
      ]);
      shared = { couple: coupleSnap.data(), interactionLedger: ledger.docs.map(d => ({ id: d.id, ...d.data() })), liveSessions: sessions.docs.map(d => ({ id: d.id, ...d.data() })), agreements: agreements.docs.map(d => ({ id: d.id, ...d.data() })), goals: goals.docs.map(d => ({ id: d.id, ...d.data() })), dossier: dossier.exists ? dossier.data() : null };
    }
  }
  await audit(getDb(), { eventType: 'data-export-created', actorUid: uid, correlationId: oidcContext.getStore()?.correlationId });
  return { exportedAt: new Date().toISOString(), private: { profile: user, privateInteractions: privateInteractions.docs.map(d => ({ id: d.id, ...d.data() })), secretAssignments: assignments.docs.map(d => ({ id: d.id, ...d.data() })), bridgePrompts: bridgePrompts.docs.map(d => ({ id: d.id, ...d.data() })), privateMemories: privateMemories.docs.map(d => ({ id: d.id, ...d.data() })), cloudExercises: exercises.docs.map(d => ({ id: d.id, ...d.data() })), guidedSessions: guidedSessions.docs.map(d => ({ id: d.id, ...d.data() })), interactionLedger: privateLedger.docs.map(d => ({ id: d.id, ...d.data() })) }, shared };
}

async function deleteFirestoreDocDeep(ref, subcollections) {
  for (const name of subcollections) {
    let snapshot;
    do {
      snapshot = await ref.collection(name).limit(300).get();
      if (snapshot.empty) break;
      const batch = getDb().batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    } while (snapshot.size === 300);
  }
  await ref.delete().catch(() => {});
}

async function deleteFirebaseAuthUser(uid) {
  const accessToken = await contextGoogleAccessToken();
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:delete`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ localId: uid }),
  });
  if (!response.ok && response.status !== 404) {
    const payload = await response.json().catch(() => ({}));
    throw httpError(502, payload?.error?.message || 'Firebase Auth deletion failed.', 'auth-delete-failed');
  }
  return { authDeleted: true };
}

// Irreversibly erases a member: private Firestore data, member-directory entry,
// Firebase Auth account, and (when solo/dissolved) eligible shared records.
async function eraseAccount(uid) {
  const userRef = getDb().doc(`users/${uid}`);
  const userSnap = await userRef.get();
  const user = userSnap.exists ? userSnap.data() : null;

  // If still linked, sever the couple first (retaining shared history unless the
  // partner has also confirmed shared-history deletion).
  if (user?.coupleId) {
    const coupleRef = getDb().doc(`couples/${user.coupleId}`);
    const coupleSnap = await coupleRef.get();
    if (coupleSnap.exists) {
      const confirmations = await coupleRef.collection('sharedDeletionConfirmations').get().catch(() => null);
      const confirmed = new Set(confirmations?.docs.map(doc => doc.id) || []);
      const bothConfirmed = (coupleSnap.data().memberUids || []).every(memberUid => confirmed.has(memberUid));
      await dissolveCouple(user.coupleId, { deleteSharedHistory: bothConfirmed, reason: 'account-erased' });
    }
  }

  // Remove the member-directory entry so the 8-digit ID is released.
  if (user?.memberCode && /^\d{8}$/.test(String(user.memberCode))) {
    await getDb().doc(`memberDirectory/${user.memberCode}`).delete().catch(() => {});
  }

  // Erase private owner-only subcollections and the profile document.
  await deleteCollectionDeep(userRef, ['guidedSessions']);
  await deleteFirestoreDocDeep(userRef, ['privateInteractions', 'secretAssignments', 'bridgePrompts', 'privateMemories', 'cloudExercises', 'interactionLedger', 'blockList']);

  await deleteFirebaseAuthUser(uid).catch(error => {
    // Record but do not abort: a stuck Auth deletion is retried on the next run.
    redactedLog('error', 'Firebase Auth deletion deferred', { code: error.code || 'auth-delete-failed', uid: privacyTag(uid) });
    throw error;
  });

  return { uid, erasedAt: new Date().toISOString() };
}

function privacyTag(value) {
  return String(value || '').slice(0, 6) + '…';
}

// Processes deletion requests whose grace period has elapsed. Idempotent: a request
// already 'completed' is skipped, and eraseAccount tolerates partially-deleted state.
async function runScheduledDeletions(limit = 25) {
  const now = Timestamp.now();
  const due = await getDb().collection('deletionRequests')
    .where('status', '==', 'pending')
    .where('scheduledEraseAfter', '<=', now)
    .limit(limit)
    .get();
  const results = [];
  for (const doc of due.docs) {
    const uid = doc.data().uid || doc.id;
    try {
      await doc.ref.set({ status: 'processing', processingStartedAt: FieldValue.serverTimestamp() }, { merge: true });
      const receipt = await eraseAccount(uid);
      await doc.ref.set({ status: 'completed', completedAt: FieldValue.serverTimestamp(), receipt }, { merge: true });
      await audit(getDb(), { eventType: 'account-deletion-completed', actorUid: uid, metadata: { receipt } });
      results.push({ uid: privacyTag(uid), status: 'completed' });
    } catch (error) {
      await doc.ref.set({ status: 'pending', lastError: error.code || 'internal', lastAttemptAt: FieldValue.serverTimestamp() }, { merge: true });
      redactedLog('error', 'Scheduled deletion failed', { code: error.code || 'internal', uid: privacyTag(uid) });
      results.push({ uid: privacyTag(uid), status: 'failed' });
    }
  }
  return { processed: results.length, results };
}

async function requestAccountDeletion(uid, data) {
  const reason = clean(data.reason, 300);
  const requestRef = getDb().collection('deletionRequests').doc(uid);
  const scheduledEraseAfter = Timestamp.fromMillis(Date.now() + DELETE_GRACE_DAYS * 86400000);
  await requestRef.set({ uid, status: 'pending', requestedAt: FieldValue.serverTimestamp(), scheduledEraseAfter, reason, idempotencyKey: clean(data.idempotencyKey, 120) || null }, { merge: true });
  await getDb().doc(`users/${uid}`).set({ deletionRequestedAt: FieldValue.serverTimestamp(), relationshipStatus: 'deletion-pending', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit(getDb(), { eventType: 'account-deletion-requested', actorUid: uid, correlationId: oidcContext.getStore()?.correlationId });
  return { ok: true, status: 'pending', graceDays: DELETE_GRACE_DAYS, scheduledEraseAfter: scheduledEraseAfter.toDate().toISOString() };
}

async function cancelAccountDeletion(uid) {
  const requestRef = getDb().collection('deletionRequests').doc(uid);
  const snap = await requestRef.get();
  if (!snap.exists || snap.data().status !== 'pending') throw httpError(409, 'There is no pending deletion to cancel.', 'no-pending-deletion');
  await requestRef.set({ status: 'cancelled', cancelledAt: FieldValue.serverTimestamp() }, { merge: true });
  await getDb().doc(`users/${uid}`).set({ deletionRequestedAt: FieldValue.delete(), relationshipStatus: 'solo', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit(getDb(), { eventType: 'account-deletion-cancelled', actorUid: uid, correlationId: oidcContext.getStore()?.correlationId });
  return { ok: true, status: 'cancelled' };
}

async function getDeletionStatus(uid) {
  const snap = await getDb().collection('deletionRequests').doc(uid).get();
  if (!snap.exists) return { status: 'none' };
  const data = snap.data();
  return {
    status: data.status || 'pending',
    requestedAt: data.requestedAt?.toDate?.().toISOString?.() || null,
    scheduledEraseAfter: data.scheduledEraseAfter?.toDate?.().toISOString?.() || null,
    completedAt: data.completedAt?.toDate?.().toISOString?.() || null,
    receipt: data.receipt || null,
  };
}

async function requestUnlink(uid, data) {
  const { coupleId, coupleRef } = await requireCouple(uid);
  const deleteSharedHistory = data.deleteSharedHistory === true;
  await coupleRef.collection('unlinkRequests').doc(uid).set({ uid, status: 'pending', deleteSharedHistory, requestedAt: FieldValue.serverTimestamp(), reason: clean(data.reason, 300) }, { merge: true });
  // Unlinking is a relationship-safety control: separate the accounts immediately
  // rather than waiting for the other member to agree. Shared *history* deletion
  // still requires both members, but the live link is severed now.
  const result = await dissolveCouple(coupleId, { deleteSharedHistory: false, reason: 'member-unlink' });
  await audit(getDb(), { eventType: 'couple-unlink-executed', actorUid: uid, coupleId, correlationId: oidcContext.getStore()?.correlationId });
  return { ok: true, coupleId, unlinked: true, sharedHistoryRetained: result.sharedRetained, sharedHistoryDeletionRequiresBothMembers: true };
}

// Severs the live link between two accounts: cancels active sessions, removes the
// couple pointer from each member profile, and (optionally) deletes shared history.
async function dissolveCouple(coupleId, { deleteSharedHistory = false, reason = 'unlink' } = {}) {
  const coupleRef = getDb().doc(`couples/${coupleId}`);
  const coupleSnap = await coupleRef.get();
  if (!coupleSnap.exists) return { dissolved: false, sharedRetained: false };
  const memberUids = coupleSnap.data().memberUids || [];
  const batch = getDb().batch();
  for (const memberUid of memberUids) {
    batch.set(getDb().doc(`users/${memberUid}`), {
      coupleId: null,
      relationshipStatus: 'solo',
      relationshipSetupComplete: true,
      unlinkedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  batch.set(coupleRef, { status: deleteSharedHistory ? 'deleted' : 'dissolved', dissolvedReason: reason, memberUids: [], dissolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  if (deleteSharedHistory) await deleteCollectionDeep(coupleRef);
  return { dissolved: true, sharedRetained: !deleteSharedHistory };
}

// Recursively deletes a document's known subcollections and the document itself.
async function deleteCollectionDeep(ref, subcollections = ['members', 'guide', 'dossierCorrections', 'unlinkRequests', 'sharedDeletionConfirmations', 'derivedSignals', 'interactionLedger', 'liveSessions', 'sessions', 'goals', 'agreements', 'sharedMemories', 'timeline']) {
  for (const name of subcollections) {
    let snapshot;
    do {
      snapshot = await ref.collection(name).limit(300).get();
      if (snapshot.empty) break;
      const batch = getDb().batch();
      for (const doc of snapshot.docs) {
        // Best-effort: delete one level of nested docs (turns/presence/homework, messages).
        for (const nested of ['turns', 'presence', 'sharedHomework', 'messages']) {
          const nestedSnap = await doc.ref.collection(nested).limit(300).get().catch(() => null);
          nestedSnap?.docs.forEach(n => batch.delete(n.ref));
        }
        batch.delete(doc.ref);
      }
      await batch.commit();
    } while (snapshot.size === 300);
  }
}

async function confirmSharedHistoryDeletion(uid) {
  const { coupleId, coupleRef, couple } = await requireCouple(uid);
  await coupleRef.collection('sharedDeletionConfirmations').doc(uid).set({ uid, confirmedAt: FieldValue.serverTimestamp() }, { merge: true });
  const confirmations = await coupleRef.collection('sharedDeletionConfirmations').get();
  const confirmed = new Set(confirmations.docs.map(doc => doc.id));
  const complete = (couple.memberUids || []).every(memberUid => confirmed.has(memberUid));
  let deleted = false;
  if (complete) {
    // Both members confirmed — actually erase the shared history and dissolve the couple.
    await dissolveCouple(coupleId, { deleteSharedHistory: true, reason: 'mutual-history-deletion' });
    deleted = true;
  }
  await audit(getDb(), { eventType: 'shared-history-deletion-confirmed', actorUid: uid, coupleId, correlationId: oidcContext.getStore()?.correlationId, metadata: { complete, deleted } });
  return { ok: true, complete, deleted };
}

async function blockMember(uid, data) {
  const blockedUid = clean(data.blockedUid, 128);
  if (!blockedUid || blockedUid === uid) throw httpError(400, 'A different member is required.', 'invalid-block');
  const activating = data.active !== false;
  await getDb().doc(`users/${uid}/blockList/${blockedUid}`).set({ blockedUid, active: activating, reason: clean(data.reason, 200), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  let unlinked = false;
  if (activating) {
    // Blocking a currently-linked partner immediately separates the accounts.
    const userSnap = await getDb().doc(`users/${uid}`).get();
    const coupleId = userSnap.data()?.coupleId;
    if (coupleId) {
      const coupleSnap = await getDb().doc(`couples/${coupleId}`).get();
      if (coupleSnap.exists && (coupleSnap.data().memberUids || []).includes(blockedUid)) {
        await dissolveCouple(coupleId, { deleteSharedHistory: false, reason: 'member-blocked' });
        unlinked = true;
      }
    }
  }
  await audit(getDb(), { eventType: activating ? 'member-blocked' : 'member-unblocked', actorUid: uid, targetUid: blockedUid, correlationId: oidcContext.getStore()?.correlationId, metadata: { unlinked } });
  return { ok: true, unlinked };
}

async function saveConsentControls(uid, data) {
  await getDb().doc(`users/${uid}`).set({ consentControls: { sanitizedPromptInfluence: data.sanitizedPromptInfluence === true, transcriptRetention: data.transcriptRetention !== false, dossierFactApproval: data.dossierFactApproval !== false, aiThemeCorrection: true, updatedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit(getDb(), { eventType: 'consent-controls-updated', actorUid: uid, correlationId: oidcContext.getStore()?.correlationId });
  return { ok: true };
}

async function listGuideBeliefs(uid) {
  const { coupleId, coupleRef } = await requireCouple(uid);
  const dossier = await coupleRef.collection('guide').doc('dossier').get();
  const structured = dossier.data()?.structured || {};
  const direct = structured.directSharedInput || {};
  const beliefs = Object.entries(direct).filter(([, value]) => Array.isArray(value) ? value.length : value != null && value !== '').map(([key, value]) => ({ id: key, label: key, value, provenance: 'couple.directSharedInput', visibility: 'shared', inputKind: 'direct', lastConfirmedAt: dossier.data()?.updatedAt || null, actions: ['correct', 'outdated', 'incorrect', 'needs-discussion', 'remove', 'request-regeneration'] }));
  return { coupleId, beliefs, privateRawResponsesExcluded: true };
}

async function updateGuideBelief(uid, data) {
  const { coupleId, coupleRef } = await requireCouple(uid);
  const action = clean(data.action, 40);
  if (!['correct','outdated','incorrect','needs-discussion','remove','request-regeneration'].includes(action)) throw httpError(400, 'Unsupported belief action.', 'invalid-belief-action');
  await coupleRef.collection('dossierCorrections').add({ beliefId: clean(data.beliefId, 120), action, replacement: action === 'correct' ? clean(data.replacement, 1000) : null, actorUid: uid, status: 'pending-review', createdAt: FieldValue.serverTimestamp() });
  await audit(getDb(), { eventType: 'guide-belief-action', actorUid: uid, coupleId, correlationId: oidcContext.getStore()?.correlationId, metadata: { action } });
  return { ok: true };
}

async function reportAbuse(uid, data) {
  const reportRef = getDb().collection('abuseReports').doc();
  await reportRef.set({ reporterUid: uid, reportedUid: clean(data.reportedUid, 128) || null, coupleId: clean(data.coupleId, 128) || null, category: clean(data.category, 80), descriptionRedacted: '[relationship text redacted by policy]', status: 'new', correlationId: oidcContext.getStore()?.correlationId || null, createdAt: FieldValue.serverTimestamp() });
  await audit(getDb(), { eventType: 'abuse-report-created', actorUid: uid, targetUid: clean(data.reportedUid, 128) || null, correlationId: oidcContext.getStore()?.correlationId });
  return { ok: true, reportId: reportRef.id };
}

const actions = {
  completeRelationshipSetup: (uid, _token, data) => completeRelationshipSetup(uid, data),
  createLiveSession: (uid, _token, data) => createLiveSession(uid, data),
  joinLiveSession: (uid, _token, data) => joinLiveSession(uid, data),
  heartbeatLiveSession: (uid, _token, data) => heartbeatLiveSession(uid, data),
  saveAssignmentFeedback: (uid, _token, data) => saveAssignmentFeedback(uid, data),
  provisionProfile: (uid, token, data) => provisionProfile(uid, token, data),
  requestPartnerLink: (uid, _token, data) => requestPartnerLink(uid, data),
  listPendingInvites: uid => listPendingInvites(uid),
  respondToPartnerInvite: (uid, _token, data) => respondToPartnerInvite(uid, data),
  savePersonalIntake: (uid, _token, data) => savePersonalIntake(uid, data),
  saveCoupleIntake: (uid, _token, data) => saveCoupleIntake(uid, data),
  syncRelationshipState: (uid, _token, data) => syncRelationshipState(uid, data),
  getGuideContext: uid => getGuideContext(uid),
  refreshGuideDossier: uid => refreshGuideDossier(uid),
  exportMyData: uid => exportMyData(uid),
  requestAccountDeletion: (uid, _token, data) => requestAccountDeletion(uid, data),
  cancelAccountDeletion: uid => cancelAccountDeletion(uid),
  getDeletionStatus: uid => getDeletionStatus(uid),
  requestUnlink: (uid, _token, data) => requestUnlink(uid, data),
  confirmSharedHistoryDeletion: uid => confirmSharedHistoryDeletion(uid),
  blockMember: (uid, _token, data) => blockMember(uid, data),
  saveConsentControls: (uid, _token, data) => saveConsentControls(uid, data),
  listGuideBeliefs: uid => listGuideBeliefs(uid),
  updateGuideBelief: (uid, _token, data) => updateGuideBelief(uid, data),
  reportAbuse: (uid, _token, data) => reportAbuse(uid, data),
};

// Exposed so tests can assert the action registry (P0-5: refreshGuideDossier must be
// registered so live-session completion can refresh the dossier without erroring).
export const accountActionNames = Object.keys(actions);

// Establishes the authenticated Google/Firestore request context so that both the
// public handler and the scheduled deletion worker share one code path.
export function withAccountContext(req, callback) {
  const oidcToken = req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  const google = createGoogleExternalClient(oidcToken);
  const firestore = createFirestoreClient(google);
  const cid = correlationId(req);
  return oidcContext.run({ token: oidcToken, google, firestore, correlationId: cid }, () => callback(cid));
}

// Exposed for the scheduled deletion worker endpoint (Vercel Cron).
export async function processScheduledDeletions(req, limit = 25) {
  return withAccountContext(req, () => runScheduledDeletions(limit));
}

// Lightweight reachability probe for the health check: exercises the workload-identity
// token exchange and a single Firestore metadata read. Reads no relationship data.
export async function probeFirestore(req) {
  return withAccountContext(req, async () => {
    await getDb().doc('systemHealth/probe').get();
    return { firestore: 'ok', googleAuth: 'ok' };
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: { code: 'method-not-allowed', message: 'Use POST.' } });
  return withAccountContext(req, async cid => {
    res.setHeader('X-Correlation-Id', cid);
    try {
      const token = await requireUser(req);
      // App Check is enforced only when the production feature flag is enabled; the
      // token exchange is skipped entirely otherwise, so default deploys are unaffected.
      await verifyAppCheck(req, FEATURE_FLAGS.enforceAppCheck ? await contextGoogleAccessToken().catch(() => null) : null);
      const action = clean(req.body?.action, 80);
      const operation = actions[action];
      if (!operation) throw httpError(400, 'Unknown account action.', 'unknown-action');
      const result = await operation(token.uid, token, req.body?.data || {});
      return res.status(200).json({ data: result });
    } catch (error) {
      redactedLog('error', 'Firebase account API error', { code: error.code || 'internal', correlationId: cid });
      return res.status(error.status || 500).json({
        error: { code: error.code || 'internal', message: error.status ? error.message : 'The account service could not complete this request.' },
      });
    }
  });
}
