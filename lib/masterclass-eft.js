const { getDb } = require('./db');

const COURSE_SLUG = 'eft-avatar-2026';
const PRIVACY_VERSION = '2026-07';
const TERMS_VERSION = '2026-07-eft';
const ACCESS_CODE_EFTAVATAR = 'EFTAVATAR';
const RATE_LIMIT_MS = 60_000;
const rateLimit = new Map();

const RELACAO_OPTIONS = {
  voluntario: 'Já sou voluntário(a) da ACURA Brasil',
  quero_voluntariar: 'Quero me voluntariar na ACURA Brasil',
};

const ALUNO_MEIRE_OPTIONS = {
  sim: 'Sim',
  nao: 'Não',
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

function normalizeAccessCode(raw) {
  const code = String(raw || '')
    .replace(/[\r\n\t]/g, ' ')
    .trim()
    .slice(0, 64);
  if (!code) return '';
  if (code.replace(/\s+/g, '').toUpperCase() === ACCESS_CODE_EFTAVATAR) {
    return ACCESS_CODE_EFTAVATAR;
  }
  return code;
}

function getWhatsAppGroupUrl() {
  const url = String(process.env.MASTERCLASS_EFT_WHATSAPP_GROUP_URL || '').trim();
  if (!url) return '';
  if (!/^https:\/\/(chat\.whatsapp\.com|wa\.me)\//i.test(url)) return '';
  return url.slice(0, 300);
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
  const profissao = String(body.profissao || '')
    .replace(/[\r\n\t]/g, ' ')
    .trim()
    .slice(0, 120);
  const aluno_meire = String(body.aluno_meire || '').trim();
  const relacao = String(body.relacao || '').trim();
  const codigo_carteirinha = normalizeAccessCode(body.codigo_carteirinha);
  const mensagem = String(body.mensagem || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, 2000);
  const privacidade =
    body.privacidade === true || body.privacidade === 'on' || body.privacidade === 'true';
  const termo_confidencialidade =
    body.termo_confidencialidade === true ||
    body.termo_confidencialidade === 'on' ||
    body.termo_confidencialidade === 'true';
  const termo_imagem =
    body.termo_imagem === true || body.termo_imagem === 'on' || body.termo_imagem === 'true';

  if (!nome || nome.length < 2) return { ok: false, error: 'nome_required' };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'email_invalid' };
  }
  if (!whatsapp) return { ok: false, error: 'whatsapp_invalid' };
  if (!profissao || profissao.length < 2) return { ok: false, error: 'profissao_required' };
  if (!ALUNO_MEIRE_OPTIONS[aluno_meire]) return { ok: false, error: 'aluno_meire_required' };
  if (!RELACAO_OPTIONS[relacao]) return { ok: false, error: 'relacao_required' };
  if (!codigo_carteirinha || codigo_carteirinha.length < 3) {
    return { ok: false, error: 'codigo_required' };
  }
  if (!privacidade) return { ok: false, error: 'privacidade_required' };
  if (!termo_confidencialidade) return { ok: false, error: 'termo_confidencialidade_required' };
  if (!termo_imagem) return { ok: false, error: 'termo_imagem_required' };

  return {
    ok: true,
    data: {
      nome,
      email,
      whatsapp,
      profissao,
      aluno_meire,
      relacao,
      codigo_carteirinha,
      mensagem,
      termo_confidencialidade: 1,
      termo_imagem: 1,
      termos_versao: TERMS_VERSION,
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
    `Profissão: ${registration.profissao}`,
    `Aluno(a) Meire Yamaguchi: ${ALUNO_MEIRE_OPTIONS[registration.aluno_meire] || registration.aluno_meire}`,
    `Relação: ${RELACAO_OPTIONS[registration.relacao] || registration.relacao}`,
    `Código (carteirinha ACURA ou EFTAVATAR): ${registration.codigo_carteirinha || '—'}`,
    `Termo confidencialidade: sim`,
    `Termo imagem/voz: sim`,
    `Versão dos termos: ${registration.termos_versao || TERMS_VERSION}`,
    `Mensagem: ${registration.mensagem || '—'}`,
    '',
    `ID: ${registration.id}`,
    `IP: ${registration.ip || '—'}`,
    `Privacidade: ${PRIVACY_VERSION}`,
    'Admin: /admin/ → aba Masterclass',
    '',
    'Após confirmar a inscrição, envie o link do grupo WhatsApp à pessoa.',
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

  const ipStr = String(ip).slice(0, 64);
  const info = db
    .prepare(
      `INSERT INTO masterclass_registrations (
        course_slug, nome, email, whatsapp, profissao, aluno_meire,
        relacao, codigo_carteirinha, mensagem,
        privacidade, marketing, status, ip, updated_at,
        termo_confidencialidade, termo_imagem, termos_versao, termos_aceitos_em
      ) VALUES (
        @course_slug, @nome, @email, @whatsapp, @profissao, @aluno_meire,
        @relacao, @codigo_carteirinha, @mensagem,
        1, 0, 'nova', @ip, datetime('now'),
        1, 1, @termos_versao, datetime('now')
      )`
    )
    .run({
      course_slug: COURSE_SLUG,
      nome: validated.data.nome,
      email: validated.data.email,
      whatsapp: validated.data.whatsapp,
      profissao: validated.data.profissao,
      aluno_meire: validated.data.aluno_meire,
      relacao: validated.data.relacao,
      codigo_carteirinha: validated.data.codigo_carteirinha,
      mensagem: validated.data.mensagem,
      termos_versao: validated.data.termos_versao,
      ip: ipStr,
    });

  const registration = {
    id: info.lastInsertRowid,
    ...validated.data,
    ip: ipStr,
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
    awaitsConfirmation: true,
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
    clauses.push(
      '(nome LIKE ? OR email LIKE ? OR whatsapp LIKE ? OR profissao LIKE ? OR codigo_carteirinha LIKE ?)'
    );
    params.push(like, like, like, like, like);
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
  ALUNO_MEIRE_OPTIONS,
  STATUS_OPTIONS,
  TERMS_VERSION,
  ACCESS_CODE_EFTAVATAR,
  getWhatsAppGroupUrl,
  handleMasterclassRegister,
  listRegistrations,
  getRegistration,
  updateRegistration,
  registrationStats,
  validateRegistrationBody,
};
