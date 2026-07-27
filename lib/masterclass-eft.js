const { getDb } = require('./db');

const COURSE_SLUG = 'eft-avatar-2026';
const PRIVACY_VERSION = '2026-07';
const RATE_LIMIT_MS = 60_000;
const rateLimit = new Map();

const RELACAO_OPTIONS = {
  voluntario: 'Já sou voluntário(a) da ACURA Brasil',
  associado: 'Sou associado(a)',
  quero_voluntariar: 'Quero me voluntariar na ACURA Brasil',
  parceiro: 'Parceiro / instituição',
  outro: 'Outro',
};

const STATUS_OPTIONS = {
  nova: 'Nova',
  confirmada: 'Confirmada',
  lista_espera: 'Lista de espera',
  aprovada_voluntario: 'Voluntariado em análise/aprovado',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
};

function isRateLimited(ip) {
  const now = Date.now();
  const last = rateLimit.get(ip);
  if (last && now - last < RATE_LIMIT_MS) return true;
  rateLimit.set(ip, now);
  if (rateLimit.size > 10_000) {
    for (const [key, time] of rateLimit) {
      if (now - time > RATE_LIMIT_MS) rateLimit.delete(key);
    }
  }
  return false;
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
    .slice(0, 254);
}

function normalizeWhatsApp(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) return null;
  return digits;
}

function validateRegistrationBody(body) {
  if (body && body.website) {
    return { ok: false, silent: true };
  }

  const nome = String(body.nome || '')
    .replace(/[\r\n\t]/g, ' ')
    .trim()
    .slice(0, 120);
  const email = normalizeEmail(body.email);
  const whatsapp = normalizeWhatsApp(body.whatsapp);
  const relacao = String(body.relacao || '').trim();
  const mensagem = String(body.mensagem || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, 2000);
  const privacidade =
    body.privacidade === true || body.privacidade === 'on' || body.privacidade === 'true';
  const marketing =
    body.marketing === true || body.marketing === 'on' || body.marketing === 'true';

  if (!nome || nome.length < 2) return { ok: false, error: 'nome_required' };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'email_invalid' };
  }
  if (!whatsapp) return { ok: false, error: 'whatsapp_invalid' };
  if (!RELACAO_OPTIONS[relacao]) return { ok: false, error: 'relacao_required' };
  if (!privacidade) return { ok: false, error: 'privacidade_required' };

  return {
    ok: true,
    data: {
      nome,
      email,
      whatsapp,
      relacao,
      mensagem,
      marketing: marketing ? 1 : 0,
    },
  };
}

async function notifyTeam(registration) {
  const { RESEND_API_KEY, SMTP_HOST, SMTP_USER, SMTP_PASS, CONTACT_TO, CONTACT_FROM } = process.env;
  const to = CONTACT_TO || 'contato@acurabrasil.org';
  const subject = `[Masterclass EFT Avatar] Nova inscrição — ${registration.nome}`;
  const text = [
    'Nova inscrição na Masterclass EFT Avatar em Emergências Humanitárias',
    '',
    `Nome: ${registration.nome}`,
    `E-mail: ${registration.email}`,
    `WhatsApp: ${registration.whatsapp}`,
    `Relação: ${RELACAO_OPTIONS[registration.relacao] || registration.relacao}`,
    `Marketing: ${registration.marketing ? 'sim' : 'não'}`,
    `Mensagem: ${registration.mensagem || '—'}`,
    '',
    `ID: ${registration.id}`,
    `Privacidade: ${PRIVACY_VERSION}`,
    'Admin: /admin/ → aba Masterclass',
  ].join('\n');

  if (RESEND_API_KEY) {
    const from = CONTACT_FROM || 'ACURABRASIL <contato@acurabrasil.org>';
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
    return;
  }

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.SMTP_PORT || 465);
    const secure =
      process.env.SMTP_SECURE === 'true' ||
      (process.env.SMTP_SECURE !== 'false' && port === 465);
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      requireTLS: !secure,
    });
    await transporter.sendMail({
      from: CONTACT_FROM || SMTP_USER,
      to,
      subject,
      text,
    });
  }
}

async function handleMasterclassRegister(req, res) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'rate_limit' });
  }

  const validated = validateRegistrationBody(req.body || {});
  if (validated.silent) return res.json({ ok: true });
  if (!validated.ok) {
    return res.status(400).json({ ok: false, error: validated.error });
  }

  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id, status FROM masterclass_registrations
       WHERE course_slug = ? AND email = ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(COURSE_SLUG, validated.data.email);

  if (existing && existing.status !== 'cancelada' && existing.status !== 'recusada') {
    return res.status(409).json({ ok: false, error: 'already_registered', id: existing.id });
  }

  const info = db
    .prepare(
      `INSERT INTO masterclass_registrations (
        course_slug, nome, email, whatsapp, relacao, mensagem,
        privacidade, marketing, status, ip, updated_at
      ) VALUES (
        @course_slug, @nome, @email, @whatsapp, @relacao, @mensagem,
        1, @marketing, 'nova', @ip, datetime('now')
      )`
    )
    .run({
      course_slug: COURSE_SLUG,
      ...validated.data,
      ip: String(ip).slice(0, 64),
    });

  const registration = {
    id: info.lastInsertRowid,
    ...validated.data,
  };

  try {
    await notifyTeam(registration);
  } catch (err) {
    console.error('masterclass notify error:', err.message);
  }

  return res.status(201).json({
    ok: true,
    id: registration.id,
    needsVolunteerReview: validated.data.relacao === 'quero_voluntariar',
  });
}

function listRegistrations({ status = '', q = '', limit = 200 } = {}) {
  const db = getDb();
  const clauses = ['course_slug = ?'];
  const params = [COURSE_SLUG];

  if (status && STATUS_OPTIONS[status]) {
    clauses.push('status = ?');
    params.push(status);
  }
  if (q) {
    const like = `%${String(q).trim().slice(0, 80)}%`;
    clauses.push('(nome LIKE ? OR email LIKE ? OR whatsapp LIKE ?)');
    params.push(like, like, like);
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
  params.push(safeLimit);

  return db
    .prepare(
      `SELECT * FROM masterclass_registrations
       WHERE ${clauses.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(...params);
}

function getRegistration(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM masterclass_registrations WHERE id = ?').get(id);
}

function updateRegistration(id, { status, admin_notes } = {}) {
  const db = getDb();
  const row = getRegistration(id);
  if (!row) return null;

  const nextStatus = status && STATUS_OPTIONS[status] ? status : row.status;
  const nextNotes =
    admin_notes != null
      ? String(admin_notes)
          .replace(/\r\n/g, '\n')
          .trim()
          .slice(0, 4000)
      : row.admin_notes;

  db.prepare(
    `UPDATE masterclass_registrations
     SET status = ?, admin_notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(nextStatus, nextNotes, id);

  return getRegistration(id);
}

function registrationStats() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) AS c
       FROM masterclass_registrations
       WHERE course_slug = ?
       GROUP BY status`
    )
    .all(COURSE_SLUG);
  const byStatus = Object.fromEntries(Object.keys(STATUS_OPTIONS).map((k) => [k, 0]));
  let total = 0;
  for (const row of rows) {
    byStatus[row.status] = row.c;
    total += row.c;
  }
  return { total, byStatus };
}

module.exports = {
  COURSE_SLUG,
  RELACAO_OPTIONS,
  STATUS_OPTIONS,
  handleMasterclassRegister,
  listRegistrations,
  getRegistration,
  updateRegistration,
  registrationStats,
  validateRegistrationBody,
};
