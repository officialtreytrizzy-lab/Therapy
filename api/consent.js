import { FieldValue } from '@google-cloud/firestore';
import { db, getGoogleAccessToken, requireUser, runWithGoogle } from './_guide-core.js';
import { audit, correlationId, enforceRateLimit, redactedLog, verifyAppCheck } from './security.js';

export const POLICY_VERSION = '2026-07-31.1';

function body(req) {
  if (Buffer.isBuffer(req.body)) {
    try { return JSON.parse(req.body.toString('utf8')); } catch { return {}; }
  }
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(String(req.body || '{}')); } catch { return {}; }
}

function errorResponse(res, error, requestId) {
  const status = Number(error?.status) || 500;
  const code = String(error?.code || 'consent-failed').slice(0, 80);
  if (status >= 500) redactedLog('error', 'consent-request-failed', { requestId, code });
  return res.status(status).json({
    error: {
      code,
      message: status >= 500 ? 'The consent record could not be saved. Try again.' : String(error?.message || 'The request could not be completed.'),
      requestId,
    },
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const requestId = correlationId(req);
  res.setHeader('X-Correlation-Id', requestId);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: { code: 'method-not-allowed', message: 'POST is required.', requestId } });
  }

  try {
    return await runWithGoogle(req, async () => {
      const user = await requireUser(req);
      const googleAccessToken = await getGoogleAccessToken();
      await verifyAppCheck(req, googleAccessToken);
      await enforceRateLimit(db(), `consent:${user.uid}`, 12, 3600);

      const value = body(req);
      if (value.version !== POLICY_VERSION || value.ageConfirmed !== true || value.accepted !== true) {
        const error = new Error('Confirm the current terms, privacy notice, adult eligibility, and AI-wellness notice.');
        error.status = 400;
        error.code = 'consent-required';
        throw error;
      }

      const userRef = db().doc(`users/${user.uid}`);
      const snapshot = await userRef.get();
      if (!snapshot.exists) {
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
      await audit(db(), {
        eventType: 'policy-consent-accepted',
        actorUid: user.uid,
        correlationId: requestId,
        visibility: 'metadata-only',
        metadata: { policyVersion: POLICY_VERSION, adultEligibilityConfirmed: true },
      }).catch(error => {
        redactedLog('error', 'consent-audit-write-failed', { requestId, code: error?.code || 'audit-failed' });
      });

      return res.status(200).json({ data: { accepted: true, version: POLICY_VERSION } });
    });
  } catch (error) {
    return errorResponse(res, error, requestId);
  }
}
