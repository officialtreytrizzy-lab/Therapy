import { FieldValue } from '@google-cloud/firestore';
import baseHandler from './guide.js';
import { captureResponse, createFirestoreForRequest, decodeFirebaseToken, flushCaptured, timestampMillis } from './account-postprocess.js';

const CLAIM_STALE_AFTER_MS = Math.max(30_000, Number(process.env.GUIDE_COMPLETION_CLAIM_STALE_MS || 120_000));

async function resolveCompletionRetry({ req, captured, db, token }) {
  if (req.body?.action !== 'completeSession') return;
  const data = captured.body?.data;
  if (!data?.idempotent || String(data.resolutionSummary || '').trim()) return;

  const userSnap = await db.doc(`users/${token.uid}`).get();
  const coupleId = userSnap.data()?.coupleId;
  const sessionId = String(req.body?.data?.sessionId || '').trim().slice(0, 100);
  if (!coupleId || !sessionId) {
    captured.statusCode = 409;
    captured.body = { error: { code: 'completion-retry-required', message: 'The session completion is not ready yet. Retry shortly.' } };
    return;
  }

  const sessionRef = db.doc(`couples/${coupleId}/liveSessions/${sessionId}`);
  const sessionSnap = await sessionRef.get();
  const session = sessionSnap.data() || {};

  if (session.status === 'completed' && String(session.resolutionSummary || '').trim()) {
    const homeworkSnap = await sessionRef.collection('sharedHomework').get();
    captured.statusCode = 200;
    captured.body = {
      data: {
        resolutionStatus: session.resolutionStatus || 'partial',
        resolutionSummary: session.resolutionSummary || '',
        unresolved: session.unresolved || [],
        fairnessNotes: session.fairnessNotes || [],
        followUpTopic: session.followUpTopic || '',
        sharedHomework: homeworkSnap.docs.map(doc => doc.data()),
        costEstimate: session.costEstimate || null,
        idempotent: true,
      },
    };
    return;
  }

  const claimAge = Date.now() - timestampMillis(session.completionClaimedAt);
  if (session.status === 'completing' && claimAge >= CLAIM_STALE_AFTER_MS) {
    await sessionRef.set({
      status: 'active',
      completionClaimedAt: FieldValue.delete(),
      completionClaimedBy: FieldValue.delete(),
      completionClaimResetAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    captured.statusCode = 409;
    captured.body = {
      error: {
        code: 'completion-claim-reset',
        message: 'The earlier completion attempt stalled and was safely reset. Please submit completion again.',
      },
    };
    return;
  }

  const remainingMs = Math.max(1_000, CLAIM_STALE_AFTER_MS - Math.max(0, claimAge));
  captured.statusCode = 202;
  captured.body = {
    error: {
      code: 'completion-in-progress',
      message: 'Another completion request is still finishing. Retry in a moment.',
    },
    retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
  };
}

export default async function handler(req, res) {
  const captured = captureResponse();
  let db = null;
  let token = null;

  try {
    if (req.method === 'POST') {
      token = decodeFirebaseToken(req);
      db = createFirestoreForRequest(req);
    }
  } catch {
    db = null;
    token = null;
  }

  await baseHandler(req, captured);

  if (captured.statusCode >= 200 && captured.statusCode < 300 && db && token) {
    try {
      await resolveCompletionRetry({ req, captured, db, token });
    } catch (error) {
      console.error('Guide completion consistency check failed', error?.code || error?.message || 'unknown');
      captured.statusCode = 500;
      captured.body = {
        error: {
          code: 'completion-consistency-failed',
          message: 'The completion state could not be verified. Please retry.',
        },
      };
    }
  }

  return flushCaptured(res, captured);
}
