function getNested(obj, path) {
  return String(path || 'registered')
    .split('.')
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function isConfigured() {
  return !!(process.env.DOCTOR8_API_BASE_URL && process.env.DOCTOR8_API_KEY);
}

async function checkEmailRegistered(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { ok: false, configured: isConfigured(), status: 'error', error: 'invalid_email' };
  }

  if (!isConfigured()) {
    return { ok: false, configured: false, status: 'not_configured', error: 'not_configured' };
  }

  const baseUrl = process.env.DOCTOR8_API_BASE_URL.replace(/\/$/, '');
  const pathTemplate = process.env.DOCTOR8_EMAIL_CHECK_PATH || '/api/users/check-email?email={email}';
  const url = baseUrl + pathTemplate.replace('{email}', encodeURIComponent(normalized));
  const method = (process.env.DOCTOR8_EMAIL_CHECK_METHOD || 'GET').toUpperCase();
  const timeoutMs = Number(process.env.DOCTOR8_API_TIMEOUT_MS || 12_000);

  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${process.env.DOCTOR8_API_KEY}`,
  };

  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify({ email: normalized }) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        configured: true,
        status: 'error',
        error: `http_${res.status}`,
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

module.exports = { checkEmailRegistered, isConfigured };
