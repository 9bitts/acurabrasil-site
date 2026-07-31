/**
 * Doctor8 integration client (Acura Brasil).
 *
 * Email check (available today):
 *   POST /api/integrations/check-email  { email } → { registered: boolean }
 *
 * Rich user lookup (optional; not yet on Doctor8 — 404 falls back to check-email):
 *   POST /api/integrations/lookup-user  { email }
 *   → {
 *       registered: boolean,
 *       user?: {
 *         id, name, email, phone, role, status, createdAt, profileUrl
 *       }
 *     }
 *
 * Env:
 *   DOCTOR8_API_BASE_URL, DOCTOR8_API_KEY
 *   DOCTOR8_EMAIL_CHECK_PATH (default /api/integrations/check-email)
 *   DOCTOR8_LOOKUP_PATH (default /api/integrations/lookup-user)
 *   DOCTOR8_REGISTERED_FIELD (default registered)
 */

function getNested(obj, path) {
  return String(path || 'registered')
    .split('.')
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function isConfigured() {
  return !!(process.env.DOCTOR8_API_BASE_URL && process.env.DOCTOR8_API_KEY);
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function buildCheckUrl(baseUrl, pathTemplate, method, email) {
  const path = pathTemplate || '/api/integrations/check-email';
  let url = baseUrl + path;
  if (method === 'GET') {
    if (path.includes('{email}')) {
      url = url.replace('{email}', encodeURIComponent(email));
    } else {
      url += (path.includes('?') ? '&' : '?') + `email=${encodeURIComponent(email)}`;
    }
  }
  return url;
}

function mapHttpError(status) {
  if (status === 400) return 'invalid_email';
  if (status === 401) return 'unauthorized';
  if (status === 404) return 'not_found_endpoint';
  if (status === 429) return 'rate_limit';
  return `http_${status}`;
}

function isTruthyFlag(value) {
  return value === true || value === 'true' || value === 1 || value === '1' || value === 'yes';
}

/** Accept several Doctor8 response shapes for "has account". */
function interpretRegistered(data) {
  if (!data || typeof data !== 'object') return false;
  const field = process.env.DOCTOR8_REGISTERED_FIELD || 'registered';
  const candidates = [
    getNested(data, field),
    data.registered,
    data.exists,
    data.found,
    data.isRegistered,
    data.is_registered,
    data.hasAccount,
    data.has_account,
    getNested(data, 'data.registered'),
    getNested(data, 'user.registered'),
  ];
  if (candidates.some(isTruthyFlag)) return true;
  if (data.user && typeof data.user === 'object') return true;
  if (data.profile && typeof data.profile === 'object') return true;
  return false;
}

function sanitizeProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const pick = (key, max = 200) => {
    const v = raw[key];
    if (v == null || v === '') return undefined;
    return String(v).trim().slice(0, max);
  };
  const profile = {
    id: pick('id', 80),
    name: pick('name', 160) || pick('nome', 160) || pick('fullName', 160) || pick('full_name', 160),
    email: pick('email', 254),
    phone: pick('phone', 40) || pick('whatsapp', 40) || pick('telefone', 40) || pick('mobile', 40),
    role: pick('role', 80) || pick('tipo', 80) || pick('type', 80),
    status: pick('status', 40),
    createdAt: pick('createdAt', 40) || pick('created_at', 40),
    profileUrl: pick('profileUrl', 400) || pick('profile_url', 400) || pick('publicUrl', 400) || pick('url', 400),
  };
  const hasAny = Object.values(profile).some(Boolean);
  return hasAny ? profile : null;
}

function extractUserFromPayload(data) {
  if (!data || typeof data !== 'object') return null;
  return (
    sanitizeProfile(data.user) ||
    sanitizeProfile(data.profile) ||
    sanitizeProfile(data.data) ||
    sanitizeProfile(data.account) ||
    null
  );
}

async function doctor8Request({ path, method = 'POST', email, body }) {
  const baseUrl = process.env.DOCTOR8_API_BASE_URL.replace(/\/$/, '');
  const timeoutMs = Number(process.env.DOCTOR8_API_TIMEOUT_MS || 12_000);
  const url = buildCheckUrl(baseUrl, path, method, email);

  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${process.env.DOCTOR8_API_KEY}`,
  };
  if (method === 'POST') headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(body || { email }) : undefined,
      signal: controller.signal,
    });
    const contentType = String(res.headers.get('content-type') || '');
    let data = {};
    if (contentType.includes('application/json')) {
      data = await res.json().catch(() => ({}));
    } else {
      // Avoid treating HTML 404 pages as JSON payloads
      await res.text().catch(() => '');
      data = {};
    }
    return { res, data };
  } finally {
    clearTimeout(timer);
  }
}

async function checkEmailRegistered(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return {
      ok: false,
      configured: isConfigured(),
      status: 'error',
      error: 'invalid_email',
      email: normalized,
    };
  }

  if (!isConfigured()) {
    return {
      ok: false,
      configured: false,
      status: 'not_configured',
      error: 'not_configured',
      email: normalized,
    };
  }

  const pathTemplate = process.env.DOCTOR8_EMAIL_CHECK_PATH || '/api/integrations/check-email';
  const method = (process.env.DOCTOR8_EMAIL_CHECK_METHOD || 'POST').toUpperCase();

  try {
    const { res, data } = await doctor8Request({
      path: pathTemplate,
      method,
      email: normalized,
      body: { email: normalized },
    });

    if (!res.ok) {
      return {
        ok: false,
        configured: true,
        status: 'error',
        error: mapHttpError(res.status),
        httpStatus: res.status,
        email: normalized,
      };
    }

    const registered = interpretRegistered(data);
    const user = extractUserFromPayload(data);

    return {
      ok: true,
      configured: true,
      status: registered ? 'registered' : 'not_found',
      registered,
      user,
      email: normalized,
      source: 'check-email',
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      status: 'error',
      error: err.name === 'AbortError' ? 'timeout' : 'network',
      email: normalized,
    };
  }
}

/**
 * Resolve account + optional profile.
 * Uses check-email as source of truth (endpoint exists on Doctor8).
 * Tries lookup-user for richer profile when available.
 */
async function lookupUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return {
      ok: false,
      configured: isConfigured(),
      status: 'error',
      error: 'invalid_email',
      email: normalized,
      user: null,
    };
  }

  if (!isConfigured()) {
    return {
      ok: false,
      configured: false,
      status: 'not_configured',
      error: 'not_configured',
      email: normalized,
      user: null,
    };
  }

  const check = await checkEmailRegistered(normalized);
  let user = check.user || null;
  let source = check.source || 'check-email';
  let registered = !!check.registered;

  const lookupPath = process.env.DOCTOR8_LOOKUP_PATH || '/api/integrations/lookup-user';

  try {
    const { res, data } = await doctor8Request({
      path: lookupPath,
      method: 'POST',
      email: normalized,
      body: { email: normalized },
    });

    if (res.ok) {
      const lookupUser = extractUserFromPayload(data);
      const lookupRegistered = interpretRegistered(data);
      if (lookupUser || lookupRegistered) {
        source = 'lookup-user';
        if (lookupUser) user = lookupUser;
        if (lookupRegistered) registered = true;
      }
    }
    // 404 / non-JSON / errors: keep check-email result
  } catch (err) {
    if (err.name === 'AbortError' && !check.ok && check.status === 'error') {
      return {
        ok: false,
        configured: true,
        status: 'error',
        error: 'timeout',
        source: 'lookup-user',
        user: null,
        email: normalized,
      };
    }
  }

  if (!check.ok && check.status === 'error') {
    return {
      ...check,
      user,
      source,
    };
  }

  return {
    ok: true,
    configured: true,
    status: registered ? 'registered' : 'not_found',
    registered,
    user,
    email: normalized,
    source,
    error: null,
  };
}

module.exports = {
  checkEmailRegistered,
  lookupUserByEmail,
  isConfigured,
  sanitizeProfile,
  interpretRegistered,
};
