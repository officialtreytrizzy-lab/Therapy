import { emailSenderConfigured } from './auth-email-link.js';
import { probeFirestore } from './firebase-account.js';

const MAX_REPORT_BYTES = 16_384;

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function safeLocation(value) {
  const raw = text(value, 2_000);
  if (!raw) return '';
  if (['inline', 'eval', 'self'].includes(raw)) return raw;
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname.slice(0, 180)}`;
  } catch {
    return raw.slice(0, 180);
  }
}

function parseReportBody(req) {
  if (Buffer.isBuffer(req.body)) {
    const raw = req.body.toString('utf8');
    if (Buffer.byteLength(raw, 'utf8') > MAX_REPORT_BYTES) return {};
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (req.body && typeof req.body === 'object') return req.body;
  const raw = typeof req.body === 'string' ? req.body : '';
  if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_REPORT_BYTES) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function handleCspReport(req, res) {
  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > MAX_REPORT_BYTES) {
    return res.status(413).json({ error: { code: 'report-too-large', message: 'The report is too large.' } });
  }
  const body = parseReportBody(req);
  const report = body['csp-report'] || body.body || body;
  console.warn(JSON.stringify({
    message: 'csp-violation',
    disposition: text(report.disposition, 32),
    effectiveDirective: text(report['effective-directive'] || report.effectiveDirective, 80),
    violatedDirective: text(report['violated-directive'] || report.violatedDirective, 120),
    blockedLocation: safeLocation(report['blocked-uri'] || report.blockedURL),
    documentLocation: safeLocation(report['document-uri'] || report.documentURL),
    sourceLocation: safeLocation(report['source-file'] || report.sourceFile),
    statusCode: Number(report['status-code'] || report.statusCode || 0) || 0,
  }));
  return res.status(204).end();
}

// Dependency-aware health check. A shallow check (default) reports configuration
// readiness without external calls. A deep check (?deep=1) probes Firestore and the
// Google workload-identity token exchange. No relationship text is ever read or logged.
function configReadiness() {
  const production = process.env.NODE_ENV === 'production';
  const firebase = Boolean(process.env.FIREBASE_API_KEY && process.env.FIREBASE_AUTH_DOMAIN && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_APP_ID);
  const workloadIdentity = Boolean(process.env.GCP_PROJECT_NUMBER || process.env.FIREBASE_PROJECT_ID);
  const vertex = Boolean(process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID);
  const smtp = emailSenderConfigured();
  const appCheckRequested = production && process.env.FIREBASE_APPCHECK_ENFORCE === 'true';
  const appCheckClientConfigured = Boolean(process.env.FIREBASE_APP_CHECK_SITE_KEY);
  const appCheckEnforced = production ? appCheckRequested && appCheckClientConfigured : 'dev';
  const appCheckReady = !production || Boolean(appCheckEnforced);
  return {
    firebaseConfig: firebase,
    workloadIdentity,
    vertexConfig: vertex,
    smtp,
    appCheckRequested,
    appCheckClientConfigured,
    appCheckEnforced,
    appCheckReady,
  };
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
  if (req.method === 'POST') return handleCspReport(req, res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: { code: 'method-not-allowed', message: 'GET or POST is required.' } });
  }

  const readiness = configReadiness();
  const deep = String(req.query?.deep || '') === '1';
  let dependencies = null;
  if (deep) dependencies = await deepChecks(req).catch(() => ({ firestore: 'error', googleAuth: 'error' }));

  const dependencyDegraded = Boolean(deep && dependencies && (dependencies.firestore !== 'ok' || dependencies.googleAuth !== 'ok'));
  const releaseReady = Boolean(
    readiness.firebaseConfig
    && readiness.workloadIdentity
    && readiness.vertexConfig
    && readiness.smtp
    && readiness.appCheckReady,
  );
  const status = dependencyDegraded ? 'degraded' : releaseReady ? 'ok' : 'attention-required';

  res.status(dependencyDegraded ? 503 : 200).json({
    status,
    releaseReady,
    platform: 'vercel',
    backend: 'firebase',
    time: new Date().toISOString(),
    readiness,
    dependencies,
  });
}
