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

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const raw = typeof req.body === 'string' ? req.body : '';
  if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_REPORT_BYTES) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: { code: 'method-not-allowed', message: 'POST is required.' } });
  }

  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > MAX_REPORT_BYTES) {
    return res.status(413).json({ error: { code: 'report-too-large', message: 'The report is too large.' } });
  }

  const body = parseBody(req);
  const report = body['csp-report'] || body.body || body;
  const safe = {
    message: 'csp-violation',
    disposition: text(report.disposition, 32),
    effectiveDirective: text(report['effective-directive'] || report.effectiveDirective, 80),
    violatedDirective: text(report['violated-directive'] || report.violatedDirective, 120),
    blockedLocation: safeLocation(report['blocked-uri'] || report.blockedURL),
    documentLocation: safeLocation(report['document-uri'] || report.documentURL),
    sourceLocation: safeLocation(report['source-file'] || report.sourceFile),
    statusCode: Number(report['status-code'] || report.statusCode || 0) || 0,
  };
  console.warn(JSON.stringify(safe));
  return res.status(204).end();
}
