const crypto = require('crypto');

const CERTS_TTL_MS = 60 * 60 * 1000;
const JWT_CLOCK_SKEW_SEC = 60;

let certsCache = { keys: null, fetchedAt: 0, teamDomain: null };

function parseAdminAllowlist() {
  const raw = process.env.ADMIN_IP_ALLOWLIST;
  if (!raw || !raw.trim()) return null;
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function parseCfAccessConfig() {
  const teamRaw = process.env.CF_ACCESS_TEAM_DOMAIN;
  const aud = process.env.CF_ACCESS_AUD?.trim();
  if (!teamRaw?.trim() || !aud) return null;
  const teamDomain = teamRaw.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return { teamDomain, aud };
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function isGuardConfigured() {
  return !!(parseCfAccessConfig() || parseAdminAllowlist());
}

function describeAdminGuardMode() {
  const cf = parseCfAccessConfig();
  const allowlist = parseAdminAllowlist();
  if (cf && allowlist) {
    return `Admin guard: Cloudflare Access + IP allowlist (${allowlist.size} entries)`;
  }
  if (cf) {
    return `Admin guard: Cloudflare Access (${cf.teamDomain})`;
  }
  if (allowlist) {
    return `Admin guard: IP allowlist (${allowlist.size} entries)`;
  }
  if (isProduction()) {
    return 'Admin routes disabled — configure CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD or ADMIN_IP_ALLOWLIST';
  }
  return null;
}

function base64UrlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function parseJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8'));
    const payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));
    const signature = base64UrlDecode(parts[2]);
    const signingInput = `${parts[0]}.${parts[1]}`;
    return { header, payload, signature, signingInput };
  } catch {
    return null;
  }
}

function verifyJwtRs256(parsed, publicKey) {
  if (!parsed || parsed.header.alg !== 'RS256') return null;
  try {
    const ok = crypto.verify(
      'RSA-SHA256',
      Buffer.from(parsed.signingInput),
      publicKey,
      parsed.signature
    );
    return ok ? parsed.payload : null;
  } catch {
    return null;
  }
}

function audMatches(payloadAud, expectedAud) {
  if (Array.isArray(payloadAud)) return payloadAud.includes(expectedAud);
  return payloadAud === expectedAud;
}

async function fetchCerts(teamDomain, force = false) {
  const now = Date.now();
  if (
    !force &&
    certsCache.keys &&
    certsCache.teamDomain === teamDomain &&
    now - certsCache.fetchedAt < CERTS_TTL_MS
  ) {
    return certsCache.keys;
  }

  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Cloudflare Access certs fetch failed: ${res.status}`);
  }
  const data = await res.json();
  const keys = Array.isArray(data.keys) ? data.keys : [];
  certsCache = { keys, fetchedAt: now, teamDomain };
  return keys;
}

async function getPublicKeyForKid(teamDomain, kid) {
  let keys = await fetchCerts(teamDomain);
  let jwk = keys.find((k) => k.kid === kid);
  if (!jwk) {
    keys = await fetchCerts(teamDomain, true);
    jwk = keys.find((k) => k.kid === kid);
  }
  if (!jwk) return null;
  try {
    return crypto.createPublicKey({ key: jwk, format: 'jwk' });
  } catch {
    return null;
  }
}

function isIpAllowed(req, allowlist) {
  const ip = req.ip || req.socket.remoteAddress || '';
  const normalized = ip.replace(/^::ffff:/, '');
  return allowlist.has(normalized) || allowlist.has(ip);
}

async function verifyCfAccessJwt(req, config) {
  const token = req.headers['cf-access-jwt-assertion'];
  if (!token || typeof token !== 'string') return false;

  const parsed = parseJwt(token);
  if (!parsed?.header?.kid) return false;

  const publicKey = await getPublicKeyForKid(config.teamDomain, parsed.header.kid);
  if (!publicKey) return false;

  const payload = verifyJwtRs256(parsed, publicKey);
  if (!payload) return false;

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || now >= payload.exp + JWT_CLOCK_SKEW_SEC) return false;
  if (payload.nbf && now + JWT_CLOCK_SKEW_SEC < payload.nbf) return false;
  if (!audMatches(payload.aud, config.aud)) return false;

  return true;
}

async function checkAdminAccess(req) {
  const cfConfig = parseCfAccessConfig();
  const allowlist = parseAdminAllowlist();

  if (!cfConfig && !allowlist) {
    return !isProduction();
  }

  let cfOk = false;
  if (cfConfig) {
    cfOk = await verifyCfAccessJwt(req, cfConfig);
  }

  let ipOk = false;
  if (allowlist) {
    ipOk = isIpAllowed(req, allowlist);
  }

  if (cfConfig && allowlist) return cfOk || ipOk;
  if (cfConfig) return cfOk;
  return ipOk;
}

function denyAdmin(req, res) {
  return res.status(404).send('Not Found');
}

function adminGuard(req, res, next) {
  checkAdminAccess(req)
    .then((allowed) => {
      if (allowed) return next();
      return denyAdmin(req, res);
    })
    .catch((err) => {
      console.error('Admin guard error:', err.message);
      return denyAdmin(req, res);
    });
}

module.exports = {
  adminGuard,
  parseAdminAllowlist,
  parseCfAccessConfig,
  describeAdminGuardMode,
  isGuardConfigured,
};
