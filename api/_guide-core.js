import { ExternalAccountClient } from 'google-auth-library';
import { AsyncLocalStorage } from 'node:async_hooks';
import { verify as verifySignature } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';

export const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'us-for-real-therapy';
export const VERTEX_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || PROJECT_ID;
// Default to a production-supported (non-preview) model. Override with GEMINI_MODEL.
export const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
export const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'global';
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const EXTERNAL_FETCH_TIMEOUT_MS = Math.max(1_000, Math.min(120_000, Number(process.env.EXTERNAL_FETCH_TIMEOUT_MS) || 30_000));
const requestContext = new AsyncLocalStorage();
let certCache = { value: null, expiresAt: 0 };

export function clean(value, max = 1000) {
  return value == null ? '' : String(value).trim().slice(0, max);
}
export function httpError(status, message, code = 'request-failed') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}
function decode(value) {
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { throw httpError(401, 'Your sign-in session is malformed.', 'invalid-token'); }
}
function createGoogleClient(subjectToken) {
  if (!subjectToken) throw new Error('The Vercel OIDC token is unavailable.');
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
  if (!client) throw new Error('Could not initialize Google workload identity.');
  return client;
}
function createDb(subjectToken) {
  return new Firestore({
    projectId: PROJECT_ID,
    databaseId: '(default)',
    preferRest: true,
    maxIdleChannels: 0,
    auth: createGoogleClient(subjectToken),
  });
}
export function db() {
  const value = requestContext.getStore()?.db;
  if (!value) throw new Error('Firestore request context is unavailable.');
  return value;
}
async function certificates() {
  if (certCache.value && certCache.expiresAt > Date.now() + 30_000) return certCache.value;
  let response;
  try {
    response = await fetch(CERTS_URL, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
    });
  } catch {
    throw httpError(503, 'Sign-in verification is temporarily unavailable.', 'certificates-unavailable');
  }
  if (!response.ok) throw httpError(503, 'Sign-in verification is temporarily unavailable.', 'certificates-unavailable');
  const value = await response.json();
  const maxAge = Number((response.headers.get('cache-control') || '').match(/max-age=(\d+)/i)?.[1] || 3600);
  certCache = { value, expiresAt: Date.now() + Math.max(300, maxAge) * 1000 };
  return value;
}
async function verifyIdToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw httpError(401, 'Sign in is required.', 'unauthenticated');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decode(encodedHeader);
  const payload = decode(encodedPayload);
  if (header.alg !== 'RS256' || !header.kid) throw httpError(401, 'Unsupported sign-in signature.', 'invalid-token');
  const cert = (await certificates())[header.kid];
  if (!cert) {
    certCache.expiresAt = 0;
    throw httpError(401, 'Your sign-in session was signed with an unknown key.', 'invalid-token');
  }
  const valid = verifySignature(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    cert,
    Buffer.from(encodedSignature, 'base64url'),
  );
  const now = Math.floor(Date.now() / 1000);
  const validSubject = typeof payload.sub === 'string' && payload.sub.length > 0 && payload.sub.length <= 128;
  const validTimes = Number.isFinite(payload.exp)
    && payload.exp > now
    && Number.isFinite(payload.iat)
    && payload.iat <= now + 60
    && (payload.auth_time == null || (Number.isFinite(payload.auth_time) && payload.auth_time <= now + 60));
  if (!valid
    || payload.aud !== PROJECT_ID
    || payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`
    || !validSubject
    || !validTimes) {
    throw httpError(401, 'Your sign-in session is invalid or expired.', 'invalid-token');
  }
  return { ...payload, uid: payload.sub };
}
export async function requireUser(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!match) throw httpError(401, 'Sign in is required.', 'unauthenticated');
  return verifyIdToken(match[1]);
}
async function accessToken() {
  const client = requestContext.getStore()?.google;
  const result = await client?.getAccessToken();
  const token = typeof result === 'string' ? result : result?.token;
  if (!token) throw new Error('Google access token is unavailable.');
  return token;
}

export async function getGoogleAccessToken() {
  return accessToken();
}
export function parseGuideJson(text) {
  const raw = String(text || '').trim();
  const candidates = [raw, raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()];
  const objectStart = raw.indexOf('{');
  const objectEnd = raw.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(raw.slice(objectStart, objectEnd + 1));
  const arrayStart = raw.indexOf('[');
  const arrayEnd = raw.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(raw.slice(arrayStart, arrayEnd + 1));
  for (const candidate of [...new Set(candidates)]) {
    try { return JSON.parse(candidate); } catch {}
  }
  throw httpError(502, 'The Guide returned an invalid structured response.', 'invalid-guide-response');
}
export async function generateVertexJson(token, url, system, prompt, maxOutputTokens, temperature = 0.35) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
    });
  } catch {
    throw httpError(502, 'The Guide is temporarily unavailable.', 'vertex-error');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(502, payload?.error?.message || 'The Guide is temporarily unavailable.', 'vertex-error');
  return {
    text: payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '',
    finishReason: payload?.candidates?.[0]?.finishReason || 'UNKNOWN',
  };
}

export async function gemini(system, prompt, maxOutputTokens = 1800) {
  const token = await accessToken();
  const url = `https://aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;
  const primary = await generateVertexJson(token, url, system, prompt, maxOutputTokens);
  try {
    return parseGuideJson(primary.text);
  } catch (error) {
    if (error.code !== 'invalid-guide-response' || !primary.text.trim()) throw error;
    const repaired = await generateVertexJson(
      token,
      url,
      'You are a strict JSON repair utility. Return one valid JSON value only. Preserve the supplied meaning and field names. Do not add commentary, markdown, or explanations.',
      `Convert the following model output into valid JSON. Preserve all available fields and meaning. If a field is incomplete, use a safe empty string, null, or empty array rather than inventing facts.\n\nMODEL OUTPUT:\n${primary.text}`,
      Math.max(1800, maxOutputTokens),
      0.05,
    );
    try {
      return parseGuideJson(repaired.text);
    } catch {
      console.error('Guide structured-output repair failed:', { primaryFinishReason: primary.finishReason, repairFinishReason: repaired.finishReason, primaryLength: primary.text.length, repairLength: repaired.text.length });
      throw httpError(502, 'The Guide returned an invalid structured response.', 'invalid-guide-response');
    }
  }
}
export function runWithGoogle(req, callback) {
  const oidcToken = req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  return requestContext.run({ google: createGoogleClient(oidcToken), db: createDb(oidcToken) }, callback);
}
