const nodemailer = require('nodemailer');
const crypto = require('crypto');

const RELACION_LABELS = {
  paciente: 'Soy el paciente',
  familiar: 'Soy familiar o responsable',
  tercero: 'Otra persona solicita ayuda',
};

const TIPO_ATENCION_LABELS = {
  medica: 'Atención médica',
  psicologica: 'Atención psicológica',
  ambas: 'Médica y psicológica',
  psicanalise: 'Psicoanálisis',
  terapias_integrativas: 'Terapias integrativas',
  paliativos: 'Cuidados paliativos',
  orientacion: 'No estoy seguro/a — necesito orientación',
};

const PRIORIDAD_LABELS = {
  emergencia: 'Emergencia — riesgo de vida o trauma grave',
  alta: 'Alta prioridad — dolor intenso, crisis emocional aguda',
  regular: 'Atención regular',
};

const SEND_TIMEOUT_MS = 12_000;
const RATE_LIMIT_MS = Number(process.env.SOS_INTAKE_RATE_LIMIT_MS ?? 20_000);
const rateLimit = new Map();

function rateLimitKey(email, ip) {
  const normalized = String(email || '').trim().toLowerCase();
  return normalized || ip || 'unknown';
}

function getRateLimitRetrySeconds(key) {
  if (!RATE_LIMIT_MS || RATE_LIMIT_MS <= 0) return 0;
  const last = rateLimit.get(key);
  if (!last) return 0;
  const remaining = RATE_LIMIT_MS - (Date.now() - last);
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

function isRateLimited(key) {
  if (!RATE_LIMIT_MS || RATE_LIMIT_MS <= 0) return false;
  return getRateLimitRetrySeconds(key) > 0;
}

function recordRateLimit(key) {
  if (!RATE_LIMIT_MS || RATE_LIMIT_MS <= 0) return;
  const now = Date.now();
  rateLimit.set(key, now);
  if (rateLimit.size > 10_000) {
    for (const [k, time] of rateLimit) {
      if (now - time > RATE_LIMIT_MS) rateLimit.delete(k);
    }
  }
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
    return { ok: false, field: 'phone' };
  }
  if (!dddDigits || dddDigits.length < 2 || dddDigits.length > 4) {
    return { ok: false, field: 'phone' };
  }
  if (!telDigits || telDigits.length < 4) {
    return { ok: false, field: 'phone' };
  }

  const national = dddDigits + telDigits;
  if (ddiDigits === '58') {
    if (national.length < 10 || national.length > 11) {
      return { ok: false, field: 'phone' };
    }
  } else if (telDigits.length < 7 || telDigits.length > 11 || national.length < 8) {
    return { ok: false, field: 'phone' };
  }

  const whatsapp = `${ddiDigits}${dddDigits}${telDigits}`;

  return {
    ok: true,
    ddi: ddiDigits,
    ddd: dddDigits,
    telefone: telDigits,
    display: `+${ddiDigits} (${dddDigits}) ${telDigits}`,
    whatsapp: `https://wa.me/${whatsapp}`,
  };
}

function generateProtocol() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  const bytes = crypto.randomBytes(4);
  for (let i = 0; i < 4; i++) {
    suffix += chars[bytes[i] % chars.length];
  }
  return `SOS-VE-${y}${m}${d}-${suffix}`;
}

function validateBody(body) {
  if (body.website) {
    return { ok: false, silent: true };
  }

  const nome = String(body.nome || '').trim();
  const email = String(body.email || '').trim();
  const relacion = String(body.relacion || '').trim();
  const nomePaciente = String(body.nome_paciente || '').trim();
  const edadRaw = body.edad;
  const ubicacion = String(body.ubicacion || '').trim();
  const tipoAtencion = String(body.tipo_atencion || '').trim();
  const prioridad = String(body.prioridad || '').trim();
  const sintomas = String(body.sintomas || '').trim();
  const observaciones = String(body.observaciones || '').trim();
  const consentimiento = body.consentimiento === true || body.consentimiento === 'true' || body.consentimiento === 'on';
  const referralSource = String(body.referral_source || '').trim().slice(0, 64) || null;
  const phone = validatePhone(body.ddi, body.ddd, body.telefone);

  if (!nome || nome.length > 200) {
    return { ok: false, error: 'validation' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { ok: false, error: 'validation' };
  }
  if (!phone.ok) {
    return { ok: false, error: 'validation', field: phone.field || 'phone' };
  }
  if (!RELACION_LABELS[relacion]) {
    return { ok: false, error: 'validation' };
  }
  if (relacion !== 'paciente') {
    if (!nomePaciente || nomePaciente.length > 200) {
      return { ok: false, error: 'validation' };
    }
  }
  let edad = null;
  if (edadRaw !== '' && edadRaw != null && edadRaw !== undefined) {
    edad = Number(edadRaw);
    if (!Number.isInteger(edad) || edad < 0 || edad > 120) {
      return { ok: false, error: 'validation' };
    }
  }
  if (!ubicacion || ubicacion.length > 200) {
    return { ok: false, error: 'validation' };
  }
  if (!TIPO_ATENCION_LABELS[tipoAtencion]) {
    return { ok: false, error: 'validation' };
  }
  if (!PRIORIDAD_LABELS[prioridad]) {
    return { ok: false, error: 'validation' };
  }
  if (!sintomas || sintomas.length > 3000) {
    return { ok: false, error: 'validation' };
  }
  if (observaciones.length > 2000) {
    return { ok: false, error: 'validation' };
  }
  if (!consentimiento) {
    return { ok: false, error: 'validation' };
  }

  const protocolo = generateProtocol();

  return {
    ok: true,
    data: {
      nome,
      email,
      phone,
      relacion,
      relacionLabel: RELACION_LABELS[relacion],
      nomePaciente: relacion !== 'paciente' ? nomePaciente : nome,
      edad,
      ubicacion,
      tipoAtencion,
      tipoAtencionLabel: TIPO_ATENCION_LABELS[tipoAtencion],
      prioridad,
      prioridadLabel: PRIORIDAD_LABELS[prioridad],
      sintomas,
      observaciones,
      protocolo,
      referralSource,
      timestamp: new Date().toISOString(),
    },
  };
}

function buildEmailContent(data) {
  const lines = [
    `Protocolo: ${data.protocolo}`,
    `Timestamp (UTC): ${data.timestamp}`,
    '',
    `Nombre solicitante: ${data.nome}`,
    `Correo: ${data.email}`,
    `WhatsApp: ${data.phone.display}`,
    `Link WhatsApp: ${data.phone.whatsapp}`,
    `Relación: ${data.relacionLabel}`,
  ];

  if (data.relacion !== 'paciente') {
    lines.push(`Nombre del paciente: ${data.nomePaciente}`);
  }
  if (data.edad != null) {
    lines.push(`Edad del paciente: ${data.edad}`);
  }

  lines.push(
    `Ubicación: ${data.ubicacion}`,
    `Tipo de atención: ${data.tipoAtencionLabel}`,
    `Prioridad: ${data.prioridadLabel}`,
    '',
    '--- Síntomas / necesidad ---',
    data.sintomas
  );

  if (data.observaciones) {
    lines.push('', '--- Información adicional ---', data.observaciones);
  }

  return {
    subject: `[SOS Venezuela] ${data.prioridadLabel} — ${data.nome} — ${data.protocolo}`,
    text: lines.join('\n'),
  };
}

function getRecipient() {
  return process.env.SOS_VENEZUELA_TO || process.env.CONTACT_TO || 'contato@acurabrasil.org';
}

async function sendViaResend(data) {
  const { subject, text } = buildEmailContent(data);
  const to = getRecipient();
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
    console.error('SOS Venezuela intake Resend error:', res.status, errBody);
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
  const to = getRecipient();
  const from = process.env.CONTACT_FROM || process.env.SMTP_USER;
  const safeName = sanitizeDisplayName(data.nome);

  await transporter.sendMail({
    from: `"SOS Venezuela ACURABRASIL" <${from}>`,
    to,
    replyTo: safeName ? `"${safeName}" <${data.email}>` : data.email,
    subject,
    text,
  });
}

async function sendIntakeEmail(data) {
  const send = process.env.RESEND_API_KEY ? sendViaResend : sendViaSmtp;
  await withTimeout(send(data), SEND_TIMEOUT_MS, 'EMAIL_SEND');
}

async function handleSosVenezuelaIntakeRequest(req, res) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  const validation = validateBody(req.body || {});
  if (!validation.ok) {
    if (validation.silent) {
      return res.json({ ok: true });
    }
    return res.status(400).json({ ok: false, error: validation.error, field: validation.field || null });
  }

  const limitKey = rateLimitKey(validation.data.email, ip);
  if (isRateLimited(limitKey)) {
    return res.status(429).json({
      ok: false,
      error: 'rate_limit',
      retryAfterSeconds: getRateLimitRetrySeconds(limitKey),
    });
  }

  let dbOk = false;
  try {
    const { persistIntake } = require('./sos-intake-store');
    persistIntake(validation.data);
    dbOk = true;
    recordRateLimit(limitKey);
  } catch (err) {
    console.error('SOS Venezuela intake DB persist failed:', err.message);
  }

  if (!isEmailConfigured()) {
    if (dbOk) {
      console.warn('SOS Venezuela intake: email not configured but saved to DB');
      return res.json({ ok: true, protocolo: validation.data.protocolo });
    }
    console.error('SOS Venezuela intake: no email provider and DB failed');
    return res.status(503).json({ ok: false, error: 'unavailable' });
  }

  try {
    await sendIntakeEmail(validation.data);
    return res.json({ ok: true, protocolo: validation.data.protocolo });
  } catch (err) {
    console.error('SOS Venezuela intake send failed:', err.code || err.message);
    if (dbOk) {
      console.warn('SOS Venezuela intake: email failed but saved to DB', validation.data.protocolo);
      return res.json({ ok: true, protocolo: validation.data.protocolo });
    }
    return res.status(500).json({ ok: false, error: 'send_failed' });
  }
}

module.exports = { handleSosVenezuelaIntakeRequest };
