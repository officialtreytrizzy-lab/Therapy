import { processScheduledDeletions } from './firebase-account.js';
import { createFirestoreForRequest } from './account-postprocess.js';
import { redactedLog } from './security.js';

function authorized(req) {
  if (req.headers['x-vercel-cron']) return true;
  const secret = process.env.DELETION_WORKER_SECRET;
  if (!secret) return false;
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return provided === secret;
}

async function captureCandidateCouples(req, limit) {
  const db = createFirestoreForRequest(req);
  const due = await db.collection('deletionRequests')
    .where('status', '==', 'pending')
    .where('scheduledEraseAfter', '<=', new Date())
    .limit(limit)
    .get();
  const coupleIds = new Set();
  for (const requestDoc of due.docs) {
    const uid = requestDoc.data().uid || requestDoc.id;
    const userSnap = await db.doc(`users/${uid}`).get();
    const coupleId = userSnap.data()?.coupleId;
    if (coupleId) coupleIds.add(coupleId);
  }
  return { db, coupleIds: [...coupleIds] };
}

async function removeDeletedCoupleParents(context) {
  if (!context) return;
  for (const coupleId of context.coupleIds) {
    const ref = context.db.doc(`couples/${coupleId}`);
    const snap = await ref.get();
    if (snap.exists && snap.data()?.status === 'deleted') await ref.delete();
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: { code: 'method-not-allowed', message: 'Use POST.' } });
  }
  if (!authorized(req)) {
    return res.status(401).json({ error: { code: 'unauthorized', message: 'This endpoint is restricted.' } });
  }
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query?.limit) || 25));
    const cleanupContext = await captureCandidateCouples(req, limit).catch(() => null);
    const result = await processScheduledDeletions(req, limit);
    await removeDeletedCoupleParents(cleanupContext);
    return res.status(200).json({ data: result });
  } catch (error) {
    redactedLog('error', 'Deletion worker failed', { code: error.code || 'internal' });
    return res.status(error.status || 500).json({
      error: { code: error.code || 'internal', message: 'The deletion worker could not complete this run.' },
    });
  }
}
