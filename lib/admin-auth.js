const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = 'acura_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const loginAttempts = new Map();

function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('ADMIN_SESSION_SECRET missing or too short — admin sessions insecure');
    }
    return secret || 'dev-insecure-secret-change-in-production-32chars';
  }
  return secret;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

function signPayload(payloadB64) {
  return crypto.createHmac('sha256', getSessionSecret()).update(payloadB64).digest('base64url');
}

function createSessionToken(username) {
  const payload = {
    u: username,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.');
  const expected = signPayload(payloadB64);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload.u || !payload.exp || Date.now() > payload.exp) return null;
    return payload.u;
  } catch {
    return null;
  }
}

function setSessionCookie(res, username) {
  const token = createSessionToken(username);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`
  );
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
  );
}

function getSessionUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verifySessionToken(cookies[SESSION_COOKIE]);
}

function requireAdmin(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  req.adminUser = user;
  return next();
}

function isLoginRateLimited(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (now - entry.windowStart > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_LOGIN_ATTEMPTS;
}

function recordLoginFailure(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > LOGIN_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  loginAttempts.set(ip, entry);
}

function clearLoginFailures(ip) {
  loginAttempts.delete(ip);
}

async function verifyAdminPassword(password) {
  const hashEnv = process.env.ADMIN_PASSWORD_HASH;
  if (hashEnv) {
    const [saltHex, hashHex] = hashEnv.split(':');
    if (!saltHex || !hashHex) return false;
    const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
    const expected = Buffer.from(hashHex, 'hex');
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  }
  const plain = process.env.ADMIN_PASSWORD;
  if (!plain) return false;
  const a = Buffer.from(String(password));
  const b = Buffer.from(String(plain));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function handleAdminLogin(req, res) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (isLoginRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'rate_limit' });
  }

  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';

  if (!username || !password || username !== expectedUser) {
    recordLoginFailure(ip);
    return res.status(401).json({ ok: false, error: 'invalid_credentials' });
  }

  const valid = await verifyAdminPassword(password);
  if (!valid) {
    recordLoginFailure(ip);
    return res.status(401).json({ ok: false, error: 'invalid_credentials' });
  }

  clearLoginFailures(ip);
  setSessionCookie(res, username);
  return res.json({ ok: true, username });
}

function handleAdminLogout(req, res) {
  clearSessionCookie(res);
  return res.json({ ok: true });
}

function handleAdminMe(req, res) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });
  return res.json({ ok: true, username: user });
}

module.exports = {
  requireAdmin,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminMe,
  getSessionUser,
  SESSION_COOKIE,
};
