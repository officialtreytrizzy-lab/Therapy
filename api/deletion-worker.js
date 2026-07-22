import { processScheduledDeletions } from './firebase-account.js';
import { redactedLog } from './security.js';

// Scheduled processor that erases accounts whose deletion grace period has elapsed.
// Triggered by Vercel Cron (see vercel.json). Access is restricted to the platform
// cron invoker or a shared secret so it cannot be run by arbitrary clients.
function authorized(req) {
  if (req.headers['x-vercel-cron']) return true;
  const secret = process.env.DELETION_WORKER_SECRET;
  if (!secret) return false;
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return provided === secret;
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
    const result = await processScheduledDeletions(req, limit);
    return res.status(200).json({ data: result });
  } catch (error) {
    redactedLog('error', 'Deletion worker failed', { code: error.code || 'internal' });
    return res.status(error.status || 500).json({
      error: { code: error.code || 'internal', message: 'The deletion worker could not complete this run.' },
    });
  }
}
