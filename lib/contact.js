const nodemailer = require('nodemailer');

const SUBJECT_LABELS = {
  associacao: 'Associação / Admissão',
  parceria: 'Parceria / Convênio',
  pesquisa: 'Pesquisa / Projeto',
  transparencia: 'Transparência / Documentos',
  'sos-venezuela': 'SOS Saúde Venezuela — Voluntário ou Atendimento',
  'sos-saude': 'SOS Saúde RS',
  doacao: 'Doação / Selo de Doador',
  outro: 'Outro',
};

const VOLUNTEER_TERM_SUBJECTS = new Set(['sos-venezuela', 'sos-saude']);
const VOLUNTEER_TERM_VERSION = '1.0';
const PRIVACY_POLICY_VERSION = '2026-07';

const SEND_TIMEOUT_MS = 12_000;
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

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), ms);
    }),
  ]);
}

function isEmailConfigured() {
  const { RESEND_API_KEY, SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  return !!(RESEND_API_KEY || (SMTP_HOST && SMTP_USER && SMTP_PASS));
}

function createTransporter() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  const port = Number(process.env.SMTP_PORT || 465);
  const secure =
    process.env.SMTP_SECURE === 'true' ||
    (process.env.SMTP_SECURE !== 'false' && port === 465);

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

function sanitizeDisplayName(name) {
  return String(name)
    .replace(/[\r\n"<>]/g, '')
    .trim()
    .slice(0, 100);
}

function validatePhone(ddi, ddd, telefone) {
  const ddiDigits = String(ddi || '').replace(/\D/g, '');
  const dddDigits = String(ddd || '').replace(/\D/g, '');
  const telDigits = String(telefone || '').replace(/\D/g, '');

  if (!ddiDigits || ddiDigits.length < 1 || ddiDigits.length > 4) {
    return { ok: false };
  }
  if (!dddDigits || dddDigits.length < 2 || dddDigits.length > 3) {
    return { ok: false };
  }
  if (!telDigits || telDigits.length < 8 || telDigits.length > 11) {
    return { ok: false };
  }

  const whatsapp = `${ddiDigits}${dddDigits}${telDigits}`;
  const display = `+${ddiDigits} (${dddDigits}) ${formatPhoneNumber(telDigits)}`;

  return {
    ok: true,
    ddi: ddiDigits,
    ddd: dddDigits,
    telefone: telDigits,
    display,
    whatsapp: `https://wa.me/${whatsapp}`,
  };
}

function formatPhoneNumber(digits) {
  if (digits.length === 9) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return digits;
}

function validateBody(body) {
  if (body.website) {
    return { ok: false, silent: true };
  }

  const nome = String(body.nome || '').trim();
  const email = String(body.email || '').trim();
  const assunto = String(body.assunto || '').trim();
  const mensagem = String(body.mensagem || '').trim();
  const phone = validatePhone(body.ddi, body.ddd, body.telefone);

  if (!nome || nome.length > 200) {
    return { ok: false, error: 'validation' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { ok: false, error: 'validation' };
  }
  if (!phone.ok) {
    return { ok: false, error: 'validation' };
  }
  if (!SUBJECT_LABELS[assunto]) {
    return { ok: false, error: 'validation' };
  }
  if (!mensagem || mensagem.length > 5000) {
    return { ok: false, error: 'validation' };
  }

  const needsVolunteerTerm = VOLUNTEER_TERM_SUBJECTS.has(assunto);
  const termAccepted =
    body.voluntario_termo === true ||
    body.voluntario_termo === 'true' ||
    body.voluntario_termo === 'on';
  if (needsVolunteerTerm && !termAccepted) {
    return { ok: false, error: 'voluntario_termo_required' };
  }

  const privacyAccepted =
    body.privacidade === true ||
    body.privacidade === 'true' ||
    body.privacidade === 'on';
  if (!privacyAccepted) {
    return { ok: false, error: 'privacidade_required' };
  }

  return {
    ok: true,
    data: {
      nome,
      email,
      assunto,
      mensagem,
      assuntoLabel: SUBJECT_LABELS[assunto],
      phone,
      voluntarioTermo: needsVolunteerTerm ? VOLUNTEER_TERM_VERSION : null,
      privacidade: {
        accepted: true,
        version: PRIVACY_POLICY_VERSION,
        timestamp: new Date().toISOString(),
      },
    },
  };
}

function buildEmailContent({ nome, email, assuntoLabel, mensagem, phone, voluntarioTermo, privacidade }) {
  const lines = [
    `Nome: ${nome}`,
    `E-mail: ${email}`,
    `Telefone: ${phone.display}`,
    `WhatsApp: ${phone.whatsapp}`,
    `Assunto: ${assuntoLabel}`,
  ];
  if (voluntarioTermo) {
    lines.push(`Termo voluntário Selo AcuraBrasil: aceito (v${voluntarioTermo})`);
  }
  if (privacidade) {
    lines.push(
      `Política de Privacidade: aceita (v${privacidade.version}) em ${privacidade.timestamp}`
    );
  }
  lines.push('', mensagem);
  return {
    subject: `[ACURABRASIL] ${assuntoLabel}`,
    text: lines.join('\n'),
  };
}

async function sendViaResend(data) {
  const { subject, text } = buildEmailContent(data);
  const to = process.env.CONTACT_TO || 'contato@acurabrasil.org';
  const from = process.env.CONTACT_FROM || 'ACURABRASIL <contato@acurabrasil.org>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: data.email,
      subject,
      text,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('Resend API error:', res.status, errBody);
    const err = new Error(`Resend ${res.status}`);
    err.code = 'RESEND_FAILED';
    throw err;
  }
}

async function sendViaSmtp(data) {
  const transporter = createTransporter();
  if (!transporter) {
    const err = new Error('SMTP not configured');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const { subject, text } = buildEmailContent(data);
  const to = process.env.CONTACT_TO || 'contato@acurabrasil.org';
  const from = process.env.CONTACT_FROM || process.env.SMTP_USER;
  const { nome, email } = data;

  const safeName = sanitizeDisplayName(nome);
  await transporter.sendMail({
    from: `"ACURABRASIL Site" <${from}>`,
    to,
    replyTo: safeName ? `"${safeName}" <${email}>` : email,
    subject,
    text,
  });
}

async function sendContactEmail(data) {
  const send = process.env.RESEND_API_KEY ? sendViaResend : sendViaSmtp;
  await withTimeout(send(data), SEND_TIMEOUT_MS, 'EMAIL_SEND');
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

  if (!isEmailConfigured()) {
    console.error('Contact form: no email provider configured');
    return res.status(503).json({ ok: false, error: 'unavailable' });
  }

  try {
    await sendContactEmail(validation.data);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Contact form send failed:', err.code || err.message);
    return res.status(500).json({ ok: false, error: 'send_failed' });
  }
}

async function verifyEmailOnStartup() {
  const to = process.env.CONTACT_TO || 'contato@acurabrasil.org';

  if (process.env.RESEND_API_KEY) {
    console.log(`Contact form: Resend configured (to: ${to})`);
    return;
  }

  const transporter = createTransporter();
  if (!transporter) {
    console.warn('Contact form: no provider configured (set RESEND_API_KEY or SMTP_*)');
    return;
  }

  const user = process.env.SMTP_USER;
  console.log(
    `Contact form: SMTP configured (${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 465}, user: ${user}, to: ${to})`
  );

  try {
    await withTimeout(transporter.verify(), SEND_TIMEOUT_MS, 'SMTP_VERIFY');
    console.log('Contact form: SMTP connection verified');
  } catch (err) {
    console.error('Contact form: SMTP verification failed:', err.message);
    console.error('GoDaddy SMTP often fails from cloud hosts — use RESEND_API_KEY instead');
  }
}

module.exports = { handleContactRequest, verifyEmailOnStartup };
