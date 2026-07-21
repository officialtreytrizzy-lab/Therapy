import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp } from '@google-cloud/firestore';

export const FEATURE_FLAGS = Object.freeze({
  launchHardening: process.env.FEATURE_PUBLIC_BETA_HARDENING !== 'false',
  enforceAppCheck: process.env.NODE_ENV === 'production' && process.env.FIREBASE_APPCHECK_ENFORCE === 'true',
  devBypass: process.env.FIREBASE_APPCHECK_DEBUG_BYPASS === 'true' || process.env.NODE_ENV !== 'production',
});

export function correlationId(req) {
  const incoming = String(req.headers['x-correlation-id'] || '').trim();
  return /^[A-Za-z0-9._:-]{8,96}$/.test(incoming) ? incoming : randomUUID();
}

export function redactedLog(level, message, fields = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(fields)) {
    if (/text|content|answer|prompt|scenario|summary|reflection|message/i.test(key)) safe[key] = '[redacted]';
    else safe[key] = value;
  }
  console[level]?.(JSON.stringify({ message, ...safe }));
}

export async function verifyAppCheck(req, googleAccessToken) {
  if (!FEATURE_FLAGS.enforceAppCheck) return { enforced: false, bypass: FEATURE_FLAGS.devBypass };
  const token = String(req.headers['x-firebase-appcheck'] || '');
  if (!token) {
    const error = new Error('App Check token is required.');
    error.status = 401; error.code = 'app-check-required'; throw error;
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const response = await fetch(`https://firebaseappcheck.googleapis.com/v1/projects/${projectId}:verifyAppCheckToken`, {
    method: 'POST',
    headers: { authorization: `Bearer ${googleAccessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ appCheckToken: token }),
  });
  if (!response.ok) {
    const error = new Error('App Check verification failed.');
    error.status = 401; error.code = 'app-check-failed'; throw error;
  }
  return { enforced: true };
}

export async function enforceRateLimit(db, key, limit, windowSeconds) {
  const ref = db.doc(`systemRateLimits/${key}`);
  const now = Date.now();
  const resetAtMillis = now + windowSeconds * 1000;
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const active = data.resetAt?.toMillis?.() > now;
    const count = active ? Number(data.count || 0) + 1 : 1;
    if (count > limit) {
      const error = new Error('Too many requests. Try again later.');
      error.status = 429; error.code = 'rate-limited'; throw error;
    }
    tx.set(ref, { count, resetAt: Timestamp.fromMillis(active ? data.resetAt.toMillis() : resetAtMillis), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { count, limit };
  });
}

export async function audit(db, event) {
  await db.collection('systemAuditEvents').add({
    eventType: event.eventType,
    actorUid: event.actorUid || null,
    targetUid: event.targetUid || null,
    coupleId: event.coupleId || null,
    correlationId: event.correlationId || null,
    visibility: event.visibility || 'metadata-only',
    outcome: event.outcome || 'ok',
    reason: event.reason ? String(event.reason).slice(0, 300) : null,
    metadata: event.metadata || {},
    createdAt: FieldValue.serverTimestamp(),
  });
}
