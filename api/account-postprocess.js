import { ExternalAccountClient } from 'google-auth-library';
import { Firestore } from '@google-cloud/firestore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'us-for-real-therapy';

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

export function createFirestoreForRequest(req) {
  const oidcToken = req.headers?.['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  return new Firestore({
    projectId: PROJECT_ID,
    databaseId: '(default)',
    preferRest: true,
    maxIdleChannels: 0,
    auth: createGoogleExternalClient(oidcToken),
  });
}

export function decodeFirebaseToken(req) {
  const authorization = String(req.headers?.authorization || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error('Firebase bearer token is unavailable.');
  const parts = match[1].split('.');
  if (parts.length !== 3) throw new Error('Firebase bearer token is malformed.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  const uid = String(payload.sub || '');
  if (!uid || uid.length > 128) throw new Error('Firebase user ID is invalid.');
  return { ...payload, uid };
}

export function captureResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, value) { this.headers[String(key)] = value; },
    getHeader(key) { return this.headers[String(key)]; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload; return this; },
    end(payload) { if (payload !== undefined) this.body = payload; return this; },
  };
}

export function flushCaptured(res, captured) {
  for (const [key, value] of Object.entries(captured.headers || {})) res.setHeader(key, value);
  if (captured.body !== null && typeof captured.body === 'object') {
    return res.status(captured.statusCode || 200).json(captured.body);
  }
  return res.status(captured.statusCode || 200).send(captured.body ?? '');
}

export function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (Number.isFinite(value._seconds)) return value._seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
