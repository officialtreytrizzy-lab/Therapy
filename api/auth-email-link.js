import nodemailer from 'nodemailer';
import { createHash } from 'node:crypto';
import { PROJECT_ID, db, getGoogleAccessToken, runWithGoogle } from './_guide-core.js';
import { correlationId, enforceRateLimit, redactedLog } from './security.js';

const APP_URL = String(process.env.APP_URL || 'https://couple-wellness.vercel.app').replace(/\/+$/, '');
const AUTH_CONTINUE_URL = process.env.AUTH_CONTINUE_URL || `${APP_URL}/dashboard`;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.ionos.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false';
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '');
const SMTP_FROM = String(process.env.SMTP_FROM || SMTP_USER).trim();
const SMTP_FROM_NAME = String(process.env.SMTP_FROM_NAME || 'US, FOR REAL').trim();
const SMTP_REPLY_TO = String(process.env.SMTP_REPLY_TO || SMTP_FROM).trim();

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function emailSenderConfigured() {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);
}

function cleanIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function privacyKey(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 32);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

export function renderSignInEmail(link) {
  const safeLink = escapeHtml(link);
  return {
    subject: 'Your secure sign-in link for US, FOR REAL',
    text: [
      'Your secure sign-in link is ready.',
      '',
      'Open this link to sign in or create your US, FOR REAL account:',
      link,
      '',
      'This link is intended only for the email address that requested it. If you did not request it, you can ignore this message.',
    ].join('\n'),
    html: `<!doctype html><html><body style="margin:0;background:#0a0d0b;color:#f4efe6;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:42px 22px"><div style="padding:30px;border:1px solid #ffffff1f;border-radius:24px;background:linear-gradient(145deg,#1b211d,#0d110f)"><div style="font-size:12px;letter-spacing:.16em;color:#86e4a5;font-weight:700">US, FOR REAL</div><h1 style="font-family:Georgia,serif;font-size:34px;line-height:1.05;margin:14px 0 12px">Your private sign-in link is ready.</h1><p style="color:#c9c2b7;line-height:1.65">Use the button below to sign in or create your account. After authentication, your permanent 8-digit member ID will appear immediately so a partner can connect with you.</p><p style="margin:28px 0"><a href="${safeLink}" style="display:inline-block;background:#63d58d;color:#06120a;text-decoration:none;font-weight:800;padding:15px 22px;border-radius:999px">Open my account</a></p><p style="color:#8f897f;font-size:13px;line-height:1.55">This link is intended only for the email address that requested it. If you did not request it, no action is needed.</p></div></div></body></html>`,
  };
}

async function generateFirebaseSignInLink(email) {
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:sendOobCode`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      requestType: 'EMAIL_SIGNIN',
      email,
      continueUrl: AUTH_CONTINUE_URL,
      canHandleCodeInApp: true,
      returnOobLink: true,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.oobLink) {
    const error = new Error(payload?.error?.message || 'Could not create the secure sign-in link.');
    error.status = response.status >= 400 && response.status < 500 ? response.status : 502;
    error.code = 'sign-in-link-generation-failed';
    throw error;
  }
  return payload.oobLink;
}

async function sendWithIonos(email, link) {
  const content = renderSignInEmail(link);
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { minVersion: 'TLSv1.2' },
  });
  await transport.sendMail({
    from: { name: SMTP_FROM_NAME, address: SMTP_FROM },
    to: email,
    replyTo: SMTP_REPLY_TO || undefined,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
}

function sendError(res, cid, error) {
  redactedLog('error', 'Authentication email request failed', {
    code: error.code || 'internal',
    correlationId: cid,
  });
  return res.status(error.status || 500).json({
    error: {
      code: error.code || 'internal',
      message: error.status ? error.message : 'The sign-in email could not be sent. Try again shortly.',
    },
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const cid = correlationId(req);
  res.setHeader('X-Correlation-Id', cid);
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { code: 'method-not-allowed', message: 'Use POST.' } });
  }

  const email = normalizeEmail(req.body?.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: { code: 'invalid-email', message: 'Enter a valid email address.' } });
  }
  if (req.body?.website) return res.status(200).json({ data: { sent: true } });
  if (!emailSenderConfigured()) {
    return res.status(503).json({
      error: {
        code: 'custom-email-not-configured',
        message: 'The custom email sender is not connected yet.',
      },
    });
  }

  try {
    return await runWithGoogle(req, async () => {
      const ipKey = privacyKey(cleanIp(req));
      const emailKey = privacyKey(email);
      await Promise.all([
        enforceRateLimit(db(), `auth-email:ip:${ipKey}`, 12, 3600),
        enforceRateLimit(db(), `auth-email:address:${emailKey}`, 5, 3600),
      ]);
      const link = await generateFirebaseSignInLink(email);
      await sendWithIonos(email, link);
      redactedLog('info', 'Authentication email sent', {
        provider: 'ionos',
        correlationId: cid,
      });
      return res.status(200).json({ data: { sent: true, provider: 'ionos' } });
    });
  } catch (error) {
    return sendError(res, cid, error);
  }
}
