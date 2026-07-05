const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { getDb } = require('./db');

const PRIVACY_VERSION = '2026-07';
const RATE_LIMIT_MS = 60_000;
const TOKEN_TTL_MS = 48 * 60 * 60 * 1000;
const SEND_TIMEOUT_MS = 12_000;
const rateLimit = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const last = rateLimit.get(ip);
  if (last && now - last < RATE_LIMIT_MS) return true;
  rateLimit.set(ip, now);
  return false;
}

function isEmailConfigured() {
  const { RESEND_API_KEY, SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  return !!(RESEND_API_KEY || (SMTP_HOST && SMTP_USER && SMTP_PASS));
}

function createTransporter() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE === 'true' || (process.env.SMTP_SECURE !== 'false' && port === 465);
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    requireTLS: !secure,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 10_000,
    tls: { minVersion: 'TLSv1.2' },
  });
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), ms);
    }),
  ]);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase().slice(0, 254);
}

function validateSubscribeBody(body) {
  if (body && body.website) {
    return { ok: false, silent: true };
  }
  const nome = String(body.nome || '').trim().slice(0, 120);
  const email = normalizeEmail(body.email);
  const privacidade = body.privacidade === true || body.privacidade === 'on' || body.privacidade === 'true';

  if (!nome || nome.length < 2) return { ok: false, error: 'nome_required' };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'email_invalid' };
  if (!privacidade) return { ok: false, error: 'privacidade_required' };

  return { ok: true, data: { nome, email } };
}

function getSiteBaseUrl(req) {
  const host = process.env.CANONICAL_HOST || 'www.acurabrasil.org';
  const proto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}

function consumeConfirmToken(db, id) {
  const consumed = `used-${crypto.randomBytes(16).toString('hex')}`;
  db.prepare(`
    UPDATE newsletter_subscribers SET confirm_token = ?, updated_at = ? WHERE id = ?
  `).run(consumed, new Date().toISOString(), id);
}

function isTokenExpired(row) {
  const issuedAt = new Date(row.updated_at || row.created_at).getTime();
  if (!Number.isFinite(issuedAt)) return true;
  return Date.now() - issuedAt > TOKEN_TTL_MS;
}

async function sendNewsletterEmail({ to, subject, text }) {
  if (process.env.RESEND_API_KEY) {
    const from = process.env.CONTACT_FROM || 'ACURABRASIL <contato@acurabrasil.org>';
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
    return;
  }

  const transporter = createTransporter();
  if (!transporter) throw new Error('SMTP not configured');
  const from = process.env.CONTACT_FROM || process.env.SMTP_USER;
  await transporter.sendMail({
    from: `"ACURABRASIL" <${from}>`,
    to,
    subject,
    text,
  });
}

async function handleNewsletterSubscribe(req, res) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'rate_limit' });
  }

  const validation = validateSubscribeBody(req.body || {});
  if (!validation.ok) {
    if (validation.silent) return res.json({ ok: true });
    return res.status(400).json({ ok: false, error: validation.error });
  }

  if (!isEmailConfigured()) {
    return res.status(503).json({ ok: false, error: 'unavailable' });
  }

  const { nome, email } = validation.data;
  const db = getDb();
  const existing = db.prepare('SELECT id, confirmed FROM newsletter_subscribers WHERE email = ?').get(email);

  if (existing && existing.confirmed) {
    return res.json({ ok: true, already: true });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();

  if (existing) {
    db.prepare(`
      UPDATE newsletter_subscribers
      SET nome = ?, confirm_token = ?, confirmed = 0, confirmed_at = NULL,
          lgpd_privacy_version = ?, ip_address = ?, updated_at = ?
      WHERE email = ?
    `).run(nome, token, PRIVACY_VERSION, ip, now, email);
  } else {
    db.prepare(`
      INSERT INTO newsletter_subscribers (nome, email, confirm_token, lgpd_privacy_version, ip_address, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(nome, email, token, PRIVACY_VERSION, ip, now, now);
  }

  const confirmUrl = `${getSiteBaseUrl(req)}/newsletter-confirm?token=${encodeURIComponent(token)}`;
  const text = [
    `Olá, ${nome}!`,
    '',
    'Obrigado por se inscribir na newsletter da ACURABRASIL.',
    'Confirme seu e-mail abrindo o link abaixo e clicando em "Confirmar inscrição":',
    confirmUrl,
    '',
    'O link expira em 48 horas.',
    'Se você não solicitou esta inscrição, ignore este e-mail.',
    '',
    'ACURABRASIL — Associação Brasil pela Cura',
  ].join('\n');

  try {
    await withTimeout(
      sendNewsletterEmail({
        to: email,
        subject: 'Confirme sua inscrição — ACURABRASIL',
        text,
      }),
      SEND_TIMEOUT_MS,
      'NEWSLETTER_SEND'
    );
    return res.json({ ok: true, pending: true });
  } catch (err) {
    console.error('Newsletter send failed:', err.message);
    return res.status(500).json({ ok: false, error: 'send_failed' });
  }
}

function handleNewsletterConfirmPage(req, res) {
  const token = String(req.query.token || '').trim();
  if (!token) {
    return res.redirect(302, '/?newsletter=invalid');
  }
  return res.redirect(302, `/newsletter-confirm?token=${encodeURIComponent(token)}`);
}

function handleNewsletterConfirm(req, res) {
  const token = String(req.body?.token || '').trim();
  if (!token || token.length < 32) {
    return res.status(400).json({ ok: false, error: 'invalid' });
  }

  const db = getDb();
  const row = db
    .prepare('SELECT id, confirmed, created_at, updated_at FROM newsletter_subscribers WHERE confirm_token = ?')
    .get(token);
  if (!row) {
    return res.status(400).json({ ok: false, error: 'invalid' });
  }

  if (isTokenExpired(row)) {
    consumeConfirmToken(db, row.id);
    return res.status(400).json({ ok: false, error: 'expired' });
  }

  if (!row.confirmed) {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE newsletter_subscribers
      SET confirmed = 1, confirmed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, row.id);
  }

  consumeConfirmToken(db, row.id);
  return res.json({ ok: true });
}

module.exports = {
  handleNewsletterSubscribe,
  handleNewsletterConfirm,
  handleNewsletterConfirmPage,
};
