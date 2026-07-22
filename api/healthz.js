import { emailSenderConfigured } from './auth-email-link.js';
import { probeFirestore } from './firebase-account.js';

// Dependency-aware health check. A shallow check (default) reports configuration
// readiness without external calls. A deep check (?deep=1) probes Firestore and the
// Google workload-identity token exchange. No relationship text is ever read or logged.
function configReadiness() {
  const firebase = Boolean(process.env.FIREBASE_API_KEY && process.env.FIREBASE_AUTH_DOMAIN && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_APP_ID);
  const workloadIdentity = Boolean(process.env.GCP_PROJECT_NUMBER || process.env.FIREBASE_PROJECT_ID);
  const vertex = Boolean(process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID);
  const smtp = emailSenderConfigured();
  const appCheck = process.env.NODE_ENV === 'production' ? process.env.FIREBASE_APPCHECK_ENFORCE === 'true' : 'dev';
  return { firebaseConfig: firebase, workloadIdentity, vertexConfig: vertex, smtp, appCheckEnforced: appCheck };
}

async function deepChecks(req) {
  const started = Date.now();
  let checks;
  try {
    checks = await probeFirestore(req);
  } catch (error) {
    checks = { firestore: 'error', googleAuth: String(error?.code || 'error') };
  }
  checks.latencyMs = Date.now() - started;
  return checks;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const readiness = configReadiness();
  const deep = String(req.query?.deep || '') === '1';
  let dependencies = null;
  if (deep) {
    dependencies = await deepChecks(req).catch(() => ({ firestore: 'error', googleAuth: 'error' }));
  }
  const degraded = deep && dependencies && (dependencies.firestore !== 'ok' || dependencies.googleAuth !== 'ok');
  res.status(degraded ? 503 : 200).json({
    status: degraded ? 'degraded' : 'ok',
    platform: 'vercel',
    backend: 'firebase',
    time: new Date().toISOString(),
    readiness,
    dependencies,
  });
}
