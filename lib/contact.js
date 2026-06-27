const nodemailer = require('nodemailer');

const SUBJECT_LABELS = {
  associacao: 'Associação / Admissão',
  parceria: 'Parceria / Convênio',
  pesquisa: 'Pesquisa / Projeto',
  transparencia: 'Transparência / Documentos',
  'sos-venezuela': 'SOS Saúde Venezuela — Voluntário ou Atendimento',
  'sos-saude': 'SOS Saúde RS',
  outro: 'Outro',
};

const RATE_LIMIT_MS = 60_000;
const rateLimit = new Map();

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

function createTransporter() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

function validateBody(body) {
  if (body.website) {
    return { ok: false, silent: true };
  }

  const nome = String(body.nome || '').trim();
  const email = String(body.email || '').trim();
  const assunto = String(body.assunto || '').trim();
  const mensagem = String(body.mensagem || '').trim();

  if (!nome || nome.length > 200) {
    return { ok: false, error: 'validation' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { ok: false, error: 'validation' };
  }
  if (!SUBJECT_LABELS[assunto]) {
    return { ok: false, error: 'validation' };
  }
  if (!mensagem || mensagem.length > 5000) {
    return { ok: false, error: 'validation' };
  }

  return {
    ok: true,
    data: {
      nome,
      email,
      assunto,
      mensagem,
      assuntoLabel: SUBJECT_LABELS[assunto],
    },
  };
}

async function sendContactEmail({ nome, email, assuntoLabel, mensagem }) {
  const transporter = createTransporter();
  if (!transporter) {
    const err = new Error('SMTP not configured');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const to = process.env.CONTACT_TO || 'contato@acurabrasil.org';
  const from = process.env.CONTACT_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from: `"ACURA BRASIL Site" <${from}>`,
    to,
    replyTo: `"${nome}" <${email}>`,
    subject: `[ACURA BRASIL] ${assuntoLabel}`,
    text: [
      `Nome: ${nome}`,
      `E-mail: ${email}`,
      `Assunto: ${assuntoLabel}`,
      '',
      mensagem,
    ].join('\n'),
  });
}

async function handleContactRequest(req, res) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'rate_limit' });
  }

  const validation = validateBody(req.body || {});
  if (!validation.ok) {
    if (validation.silent) {
      return res.json({ ok: true });
    }
    return res.status(400).json({ ok: false, error: validation.error });
  }

  if (!createTransporter()) {
    console.error('Contact form: SMTP not configured');
    return res.status(503).json({ ok: false, error: 'unavailable' });
  }

  try {
    await sendContactEmail(validation.data);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Contact form send failed:', err.message);
    return res.status(500).json({ ok: false, error: 'send_failed' });
  }
}

module.exports = { handleContactRequest };
