/**
 * Doctor8 integration client (Acura Brasil).
 *
 * Email check (legacy):
 *   POST /api/integrations/check-email  { email } → { registered: boolean }
 *
 * Rich user lookup (preferred for admin tools):
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

function sanitizeProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const pick = (key, max = 200) => {
    const v = raw[key];
    if (v == null || v === '') return undefined;
    return String(v).trim().slice(0, max);
  };
  const profile = {
    id: pick('id', 80),
    name: pick('name', 160) || pick('nome', 160),
    email: pick('email', 254),
    phone: pick('phone', 40) || pick('whatsapp', 40) || pick('telefone', 40),
    role: pick('role', 80) || pick('tipo', 80),
    status: pick('status', 40),
    createdAt: pick('createdAt', 40) || pick('created_at', 40),
    profileUrl: pick('profileUrl', 400) || pick('profile_url', 400),
  };
  const hasAny = Object.values(profile).some(Boolean);
  return hasAny ? profile : null;
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
    const data = await res.json().catch(() => ({}));
    return { res, data };
  } finally {
    clearTimeout(timer);
  }
}

async function checkEmailRegistered(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { ok: false, configured: isConfigured(), status: 'error', error: 'invalid_email' };
  }

  if (!isConfigured()) {
    return { ok: false, configured: false, status: 'not_configured', error: 'not_configured' };
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
      };
    }

    const field = process.env.DOCTOR8_REGISTERED_FIELD || 'registered';
    const value = getNested(data, field);
    const registered = value === true || value === 'true' || value === 1;

    return {
      ok: true,
      configured: true,
      status: registered ? 'registered' : 'not_found',
      registered,
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      status: 'error',
      error: err.name === 'AbortError' ? 'timeout' : 'network',
    };
  }
}

/**
 * Rich lookup. Falls back to checkEmailRegistered when lookup endpoint is missing (404)
 * or returns an incomplete payload.
 */
async function lookupUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { ok: false, configured: isConfigured(), status: 'error', error: 'invalid_email' };
  }

  if (!isConfigured()) {
    return { ok: false, configured: false, status: 'not_configured', error: 'not_configured' };
  }

  const lookupPath = process.env.DOCTOR8_LOOKUP_PATH || '/api/integrations/lookup-user';

  try {
    const { res, data } = await doctor8Request({
      path: lookupPath,
      method: 'POST',
      email: normalized,
      body: { email: normalized },
    });

    if (res.status === 404) {
      const fallback = await checkEmailRegistered(normalized);
      return {
        ...fallback,
        source: 'check-email',
        user: null,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        configured: true,
        status: 'error',
        error: mapHttpError(res.status),
        httpStatus: res.status,
        source: 'lookup-user',
        user: null,
      };
    }

    const field = process.env.DOCTOR8_REGISTERED_FIELD || 'registered';
    const value = getNested(data, field);
    const registered = value === true || value === 'true' || value === 1;
    const user = sanitizeProfile(data.user || data.profile || null);

    return {
      ok: true,
      configured: true,
      status: registered ? 'registered' : 'not_found',
      registered,
      user,
      source: 'lookup-user',
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return {
        ok: false,
        configured: true,
        status: 'error',
        error: 'timeout',
        source: 'lookup-user',
        user: null,
      };
    }
    const fallback = await checkEmailRegistered(normalized);
    return {
      ...fallback,
      source: 'check-email',
      user: null,
    };
  }
}

module.exports = { checkEmailRegistered, lookupUserByEmail, isConfigured, sanitizeProfile };
