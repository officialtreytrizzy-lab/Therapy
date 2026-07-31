import { FieldValue } from '@google-cloud/firestore';
import baseHandler from './firebase-account.js';
import { captureResponse, createFirestoreForRequest, flushCaptured } from './account-postprocess.js';
import { audit, enforceRateLimit, redactedLog } from './security.js';

export const POLICY_VERSION = '2026-07-31.1';

async function activeRelationshipStatus(db, uid, user) {
  const coupleId = user?.coupleId || null;
  if (!coupleId) return { relationshipStatus: 'solo', coupleId: null };
  const coupleSnap = await db.doc(`couples/${coupleId}`).get();
  const couple = coupleSnap.exists ? coupleSnap.data() : null;
  const active = Boolean(
    couple
    && !['deleted', 'dissolved'].includes(couple.status)
    && Array.isArray(couple.memberUids)
    && couple.memberUids.includes(uid)
  );
  return active
    ? { relationshipStatus: 'linked', coupleId }
    : { relationshipStatus: 'solo', coupleId: null };
}

function validatePolicyConsent(req) {
  if (req.body?.action !== 'saveConsentControls' || req.body?.data?.acceptCurrentPolicies !== true) return null;
  const data = req.body.data;
  if (data.policyVersion !== POLICY_VERSION || data.ageConfirmed !== true || data.accepted !== true) {
    const error = new Error('Confirm the current terms, privacy notice, adult eligibility, and AI-wellness notice.');
    error.status = 400;
    error.code = 'consent-required';
    return error;
  }
  return null;
}

export async function postprocessAccountAction({ req, captured, db, token, priorCoupleId }) {
  const action = String(req.body?.action || '');
  const userRef = db.doc(`users/${token.uid}`);

  if (action === 'provisionProfile') {
    const authProvider = String(token.firebase?.sign_in_provider || 'unknown').trim().slice(0, 40);
    await userRef.set({ authProvider, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (captured.body?.data?.profile) captured.body.data.profile.authProvider = authProvider;
  }

  if (action === 'saveConsentControls' && req.body?.data?.acceptCurrentPolicies === true) {
    await enforceRateLimit(db, `consent:${token.uid}`, 12, 3600);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      const error = new Error('Finish account setup before accepting the policies.');
      error.status = 409;
      error.code = 'profile-required';
      throw error;
    }
    await userRef.set({
      policyConsentVersion: POLICY_VERSION,
      policyConsentAcceptedAt: FieldValue.serverTimestamp(),
      adultEligibilityConfirmed: true,
      adultEligibilityConfirmedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await audit(db, {
      eventType: 'policy-consent-accepted',
      actorUid: token.uid,
      correlationId: captured.headers?.['X-Correlation-Id'] || null,
      visibility: 'metadata-only',
      metadata: { policyVersion: POLICY_VERSION, adultEligibilityConfirmed: true },
    }).catch(error => {
      redactedLog('error', 'consent-audit-write-failed', { code: error?.code || 'audit-failed' });
    });
    if (captured.body?.data) Object.assign(captured.body.data, { accepted: true, version: POLICY_VERSION });
  }

  if (action === 'cancelAccountDeletion') {
    const userSnap = await userRef.get();
    const corrected = await activeRelationshipStatus(db, token.uid, userSnap.data() || {});
    await userRef.set({ ...corrected, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (captured.body?.data) Object.assign(captured.body.data, corrected);
  }

  if (action === 'confirmSharedHistoryDeletion' && captured.body?.data?.deleted === true && priorCoupleId) {
    await db.doc(`couples/${priorCoupleId}`).delete();
  }
}

export default async function handler(req, res) {
  const validationError = validatePolicyConsent(req);
  if (validationError) {
    return res.status(validationError.status).json({
      error: { code: validationError.code, message: validationError.message },
    });
  }

  const captured = captureResponse();
  await baseHandler(req, captured);

  if (captured.statusCode >= 200 && captured.statusCode < 300 && captured.__verifiedFirebaseToken) {
    try {
      const token = captured.__verifiedFirebaseToken;
      const db = createFirestoreForRequest(req);
      const priorCoupleId = req.body?.action === 'confirmSharedHistoryDeletion'
        ? captured.__priorCoupleId || null
        : null;
      await postprocessAccountAction({ req, captured, db, token, priorCoupleId });
    } catch (error) {
      console.error('Account lifecycle post-processing failed', error?.code || error?.message || 'unknown');
      captured.statusCode = Number(error?.status) || 500;
      captured.body = {
        error: {
          code: error?.code || 'account-postprocess-failed',
          message: error?.status ? error.message : 'The account action completed, but its final consistency check failed. Please retry.',
        },
      };
    }
  }

  delete captured.__verifiedFirebaseToken;
  delete captured.__priorCoupleId;
  return flushCaptured(res, captured);
}
