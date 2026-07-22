import { FieldValue } from '@google-cloud/firestore';
import baseHandler from './firebase-account.js';
import { captureResponse, createFirestoreForRequest, decodeFirebaseToken, flushCaptured } from './account-postprocess.js';

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

export async function postprocessAccountAction({ req, captured, db, token, priorCoupleId }) {
  const action = String(req.body?.action || '');
  const userRef = db.doc(`users/${token.uid}`);

  if (action === 'provisionProfile') {
    const authProvider = String(token.firebase?.sign_in_provider || 'unknown').trim().slice(0, 40);
    await userRef.set({ authProvider, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (captured.body?.data?.profile) captured.body.data.profile.authProvider = authProvider;
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
  const captured = captureResponse();
  let db = null;
  let token = null;
  let priorCoupleId = null;

  try {
    if (req.method === 'POST') {
      token = decodeFirebaseToken(req);
      db = createFirestoreForRequest(req);
      if (req.body?.action === 'confirmSharedHistoryDeletion') {
        const before = await db.doc(`users/${token.uid}`).get();
        priorCoupleId = before.data()?.coupleId || null;
      }
    }
  } catch {
    // The canonical handler still performs full token and OIDC verification.
    db = null;
    token = null;
  }

  await baseHandler(req, captured);

  if (captured.statusCode >= 200 && captured.statusCode < 300 && db && token) {
    try {
      await postprocessAccountAction({ req, captured, db, token, priorCoupleId });
    } catch (error) {
      console.error('Account lifecycle post-processing failed', error?.code || error?.message || 'unknown');
      captured.statusCode = 500;
      captured.body = {
        error: {
          code: 'account-postprocess-failed',
          message: 'The account action completed, but its final consistency check failed. Please retry.',
        },
      };
    }
  }

  return flushCaptured(res, captured);
}
