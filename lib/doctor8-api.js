/**
 * Doctor8 integration client (Acura Brasil).
 *
 * Email check (available today on Doctor8):
 *   POST /api/integrations/check-email  { email }
 *
 * Preferred rich response (extend check-email and/or lookup-user):
 *   {
 *     "registered": true,
 *     "approved": true,
 *     "approvalStatus": "approved",
 *     "documentsVerified": true,
 *     "user": {
 *       "id": "...",
 *       "name": "...",
 *       "email": "...",
 *       "phone": "...",
 *       "role": "...",
 *       "status": "active",
 *       "approved": true,
 *       "approvalStatus": "approved",
 *       "documentsVerified": true,
 *       "createdAt": "...",
 *       "profileUrl": "https://app.doctor8.org/..."
 *     }
 *   }
 *
 * approvalStatus values we normalize to:
 *   approved | pending | rejected | unknown
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
  return value === true || value === 'true' || value === 1 || value === '1' || value === 'yes' || value === 'sim';
}

function isFalsyFlag(value) {
  return value === false || value === 'false' || value === 0 || value === '0' || value === 'no' || value === 'nao' || value === 'não';
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

/**
 * Normalize admin approval / document verification from Doctor8.
 * "approved" means reviewed in Doctor8 admin with documents conferred.
 */
function interpretApproval(...sources) {
  const normalizeToken = (raw) =>
    String(raw || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;

    const boolCandidates = [
      src.approved,
      src.adminApproved,
      src.admin_approved,
      src.aprovado,
      src.documentsVerified,
      src.documents_verified,
      src.documentVerified,
      src.document_verified,
      src.verified,
      src.isVerified,
      src.is_verified,
      getNested(src, 'admin.approved'),
      getNested(src, 'verification.approved'),
      getNested(src, 'documents.verified'),
    ];
    if (boolCandidates.some(isTruthyFlag)) {
      return { approvalStatus: 'approved', approved: true, documentsVerified: true };
    }
    if (boolCandidates.some(isFalsyFlag)) {
      // explicit false may still be pending vs rejected — check status strings below
    }

    const statusCandidates = [
      src.approvalStatus,
      src.approval_status,
      src.adminStatus,
      src.admin_status,
      src.verificationStatus,
      src.verification_status,
      src.documentStatus,
      src.document_status,
      src.statusAprovacao,
      src.status_aprovacao,
      src.aprovacao,
      typeof src.status === 'string' && /approv|pend|reject|verif|document/i.test(src.status)
        ? src.status
        : null,
    ]
      .filter(Boolean)
      .map(normalizeToken);

    for (const token of statusCandidates) {
      if (
        token === 'approved' ||
        token === 'aprovado' ||
        token === 'aprovada' ||
        token === 'verified' ||
        token === 'verificado' ||
        token === 'active' ||
        token === 'ativo'
      ) {
        return { approvalStatus: 'approved', approved: true, documentsVerified: true };
      }
      if (
        token === 'pending' ||
        token === 'pendente' ||
        token === 'in_review' ||
        token === 'em_analise' ||
        token === 'em analise' ||
        token === 'submitted' ||
        token === 'aguardando'
      ) {
        return { approvalStatus: 'pending', approved: false, documentsVerified: false };
      }
      if (
        token === 'rejected' ||
        token === 'rejeitado' ||
        token === 'rejeitada' ||
        token === 'denied' ||
        token === 'recusado' ||
        token === 'recusada'
      ) {
        return { approvalStatus: 'rejected', approved: false, documentsVerified: false };
      }
    }

    if (boolCandidates.some(isFalsyFlag)) {
      return { approvalStatus: 'pending', approved: false, documentsVerified: false };
    }
  }

  return { approvalStatus: 'unknown', approved: null, documentsVerified: null };
}

function sanitizeProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const pick = (key, max = 200) => {
    const v = raw[key];
    if (v == null || v === '') return undefined;
    return String(v).trim().slice(0, max);
  };
  const approval = interpretApproval(raw);
  const profile = {
    id: pick('id', 80),
    name: pick('name', 160) || pick('nome', 160) || pick('fullName', 160) || pick('full_name', 160),
    email: pick('email', 254),
    phone: pick('phone', 40) || pick('whatsapp', 40) || pick('telefone', 40) || pick('mobile', 40),
    role: pick('role', 80) || pick('tipo', 80) || pick('type', 80),
    status: pick('status', 40),
    createdAt: pick('createdAt', 40) || pick('created_at', 40),
    profileUrl: pick('profileUrl', 400) || pick('profile_url', 400) || pick('publicUrl', 400) || pick('url', 400),
    approvalStatus: approval.approvalStatus,
    approved: approval.approved,
    documentsVerified: approval.documentsVerified,
  };
  const hasIdentity = !!(profile.id || profile.name || profile.email || profile.phone || profile.role);
  const hasApproval = approval.approvalStatus !== 'unknown';
  if (!hasIdentity && !hasApproval) return null;
  return profile;
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

function buildLookupResult({ registered, user, email, source, approval, rawData }) {
  const fromPayload = interpretApproval(rawData, user, rawData?.user, rawData?.data);
  const merged = approval?.approvalStatus !== 'unknown' ? approval : fromPayload;
  const enrichedUser = user
    ? {
        ...user,
        approvalStatus: user.approvalStatus !== 'unknown' ? user.approvalStatus : merged.approvalStatus,
        approved: user.approved != null ? user.approved : merged.approved,
        documentsVerified:
          user.documentsVerified != null ? user.documentsVerified : merged.documentsVerified,
      }
    : merged.approvalStatus !== 'unknown'
      ? {
          approvalStatus: merged.approvalStatus,
          approved: merged.approved,
          documentsVerified: merged.documentsVerified,
        }
      : null;

  return {
    ok: true,
    configured: true,
    status: registered ? 'registered' : 'not_found',
    registered: !!registered,
    approvalStatus: merged.approvalStatus,
    approved: merged.approved,
    documentsVerified: merged.documentsVerified,
    user: enrichedUser,
    email,
    source,
    error: null,
  };
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
      approvalStatus: 'unknown',
      approved: null,
      documentsVerified: null,
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
      approvalStatus: 'unknown',
      approved: null,
      documentsVerified: null,
      user: null,
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
        approvalStatus: 'unknown',
        approved: null,
        documentsVerified: null,
        user: null,
      };
    }

    const registered = interpretRegistered(data);
    const user = extractUserFromPayload(data);
    return {
      ...buildLookupResult({
        registered,
        user,
        email: normalized,
        source: 'check-email',
        rawData: data,
      }),
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      status: 'error',
      error: err.name === 'AbortError' ? 'timeout' : 'network',
      email: normalized,
      approvalStatus: 'unknown',
      approved: null,
      documentsVerified: null,
      user: null,
    };
  }
}

/**
 * Resolve account + profile + admin approval.
 * Uses check-email first; merges lookup-user when available.
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
      approvalStatus: 'unknown',
      approved: null,
      documentsVerified: null,
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
      approvalStatus: 'unknown',
      approved: null,
      documentsVerified: null,
    };
  }

  const check = await checkEmailRegistered(normalized);
  if (!check.ok && check.status === 'error') {
    return check;
  }

  let registered = !!check.registered;
  let user = check.user || null;
  let source = check.source || 'check-email';
  let approvalStatus = check.approvalStatus || 'unknown';
  let approved = check.approved;
  let documentsVerified = check.documentsVerified;
  let rawData = null;

  const lookupPath = process.env.DOCTOR8_LOOKUP_PATH || '/api/integrations/lookup-user';

  try {
    const { res, data } = await doctor8Request({
      path: lookupPath,
      method: 'POST',
      email: normalized,
      body: { email: normalized },
    });

    if (res.ok) {
      rawData = data;
      const lookupUser = extractUserFromPayload(data);
      const lookupRegistered = interpretRegistered(data);
      const lookupApproval = interpretApproval(data, lookupUser);
      if (lookupUser || lookupRegistered || lookupApproval.approvalStatus !== 'unknown') {
        source = 'lookup-user';
        if (lookupUser) user = lookupUser;
        if (lookupRegistered) registered = true;
        if (lookupApproval.approvalStatus !== 'unknown') {
          approvalStatus = lookupApproval.approvalStatus;
          approved = lookupApproval.approved;
          documentsVerified = lookupApproval.documentsVerified;
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError' && !check.ok) {
      return {
        ok: false,
        configured: true,
        status: 'error',
        error: 'timeout',
        source: 'lookup-user',
        user: null,
        email: normalized,
        approvalStatus: 'unknown',
        approved: null,
        documentsVerified: null,
      };
    }
  }

  return buildLookupResult({
    registered,
    user,
    email: normalized,
    source,
    approval: { approvalStatus, approved, documentsVerified },
    rawData: rawData || undefined,
  });
}

module.exports = {
  checkEmailRegistered,
  lookupUserByEmail,
  isConfigured,
  sanitizeProfile,
  interpretRegistered,
  interpretApproval,
};
