const nodemailer = require('nodemailer');
const crypto = require('crypto');
const {
  parseVenezuelaWhatsApp,
  resolvePhoneFromBody,
  resolveUbicacionFromBody,
  isValidEstado,
} = require('./venezuela-intake-form');

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

const PRIVACY_POLICY_VERSION = '2026-07';
const MIN_FILL_MS = 3_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SEND_TIMEOUT_MS = 12_000;
const RATE_LIMIT_MS = Number(process.env.SOS_INTAKE_RATE_LIMIT_MS ?? 20_000);
const IP_RATE_LIMIT_WINDOW_MS = 60_000;
const IP_RATE_LIMIT_MAX = 10;
const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const ipRateLimit = new Map();
const emailIpRateLimit = new Map();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function rateLimitKey(ip, email) {
  return crypto.createHash('sha256').update(`${ip}:${normalizeEmail(email)}`).digest('hex');
}

function pruneRateLimitMap(map, maxAgeMs) {
  const now = Date.now();
  if (map.size <= 10_000) return;
  for (const [key, value] of map) {
    const age = typeof value === 'number' ? now - value : now - value.windowStart;
    if (age > maxAgeMs) map.delete(key);
  }
}

function isIpRateLimited(ip) {
  const now = Date.now();
  let entry = ipRateLimit.get(ip);
  if (!entry || now - entry.windowStart >= IP_RATE_LIMIT_WINDOW_MS) {
    entry = { count: 0, windowStart: now };
  }
  if (entry.count >= IP_RATE_LIMIT_MAX) {
    ipRateLimit.set(ip, entry);
    return true;
  }
  entry.count += 1;
  ipRateLimit.set(ip, entry);
  pruneRateLimitMap(ipRateLimit, IP_RATE_LIMIT_WINDOW_MS);
  return false;
}

function getIpRateLimitRetrySeconds(ip) {
  const entry = ipRateLimit.get(ip);
  if (!entry) return 0;
  const remaining = IP_RATE_LIMIT_WINDOW_MS - (Date.now() - entry.windowStart);
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

function isEmailIpRateLimited(ip, email) {
  if (!RATE_LIMIT_MS || RATE_LIMIT_MS <= 0) return false;
  const key = rateLimitKey(ip, email);
  const now = Date.now();
  const last = emailIpRateLimit.get(key);
  if (last && now - last < RATE_LIMIT_MS) return true;
  emailIpRateLimit.set(key, now);
  pruneRateLimitMap(emailIpRateLimit, RATE_LIMIT_MS);
  return false;
}

function getEmailIpRateLimitRetrySeconds(ip, email) {
  if (!RATE_LIMIT_MS || RATE_LIMIT_MS <= 0) return 0;
  const key = rateLimitKey(ip, email);
  const last = emailIpRateLimit.get(key);
  if (!last) return 0;
  const remaining = RATE_LIMIT_MS - (Date.now() - last);
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

function _resetRateLimitsForTests() {
  ipRateLimit.clear();
  emailIpRateLimit.clear();
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
  return resolvePhoneFromBody({ ddi, ddd, telefone });
}

function generateProtocol() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const bytes = crypto.randomBytes(10);
  let suffix = '';
  for (let i = 0; i < 10; i++) {
    suffix += CROCKFORD_BASE32[bytes[i] & 31];
  }
  return `SOS-VE-${y}${m}${d}-${suffix}`;
}

function parseClientRequestId(raw) {
  const id = String(raw || '').trim();
  if (!id || !UUID_RE.test(id)) return null;
  return id;
}

function validateBody(body) {
  if (body.website) {
    return { ok: false, silent: true, reason: 'honeypot' };
  }

  const startedAt = Number(body.form_started_at);
  if (!Number.isFinite(startedAt) || Date.now() - startedAt < MIN_FILL_MS) {
    return { ok: false, silent: true, reason: 'timing' };
  }

  const nome = String(body.nome || '').trim();
  const email = String(body.email || '').trim();
  const relacion = String(body.relacion || '').trim();
  const nomePaciente = String(body.nome_paciente || '').trim();
  const edadRaw = body.edad;
  const ciudad = String(body.ciudad || '').trim();
  const estado = String(body.estado || '').trim();
  const ubicacion = resolveUbicacionFromBody(body);
  const tipoAtencion = String(body.tipo_atencion || '').trim();
  const prioridad = String(body.prioridad || '').trim();
  const sintomas = String(body.sintomas || '').trim();
  const observaciones = String(body.observaciones || '').trim();
  const consentimiento = body.consentimiento === true || body.consentimiento === 'true' || body.consentimiento === 'on';
  const lgpdPrivacidade =
    body.lgpd_privacidade === true || body.lgpd_privacidade === 'true' || body.lgpd_privacidade === 'on';
  const referralSource = String(body.referral_source || '').trim().slice(0, 64) || null;
  const phone = resolvePhoneFromBody(body);
  const clientRequestId = parseClientRequestId(body.client_request_id);

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
  if (body.ciudad !== undefined || body.estado !== undefined) {
    if (!ciudad || ciudad.length > 120) {
      return { ok: false, error: 'validation', field: 'ciudad' };
    }
    if (!estado || !isValidEstado(estado)) {
      return { ok: false, error: 'validation', field: 'estado' };
    }
  } else if (!ubicacion || ubicacion.length > 200) {
    return { ok: false, error: 'validation', field: 'ubicacion' };
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
  if (!lgpdPrivacidade) {
    return { ok: false, error: 'lgpd_privacy_required' };
  }

  const protocolo = generateProtocol();
  const privacyTimestamp = new Date().toISOString();

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
      clientRequestId,
      timestamp: privacyTimestamp,
      lgpdPrivacy: {
        accepted: true,
        version: PRIVACY_POLICY_VERSION,
        timestamp: privacyTimestamp,
      },
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

  if (data.lgpdPrivacy) {
    lines.push(
      '',
      '--- Consentimiento LGPD ACURABRASIL ---',
      `Política de Privacidad: aceptada (v${data.lgpdPrivacy.version}) en ${data.lgpdPrivacy.timestamp}`
    );
  }

  return {
    subject: `[SOS Venezuela] ${data.prioridadLabel} — ${data.nome} — ${data.protocolo}`,
    text: lines.join('\n'),
  };
}

function getRecipient() {
  return process.env.SOS_VENEZUELA_TO || process.env.CONTACT_TO || 'contato@acurabrasil.org';
}

function getDoctor8RegisterUrl() {
  const base = String(process.env.DOCTOR8_API_BASE_URL || 'https://app.doctor8.org').replace(/\/$/, '');
  return `${base}/register?callbackUrl=%2Furgent`;
}

function getWhatsappNumber() {
  try {
    const { getDb } = require('./db');
    const row = getDb().prepare('SELECT whatsapp_number FROM sos_config WHERE id = 1').get();
    return row?.whatsapp_number || '5531971720053';
  } catch {
    return '5531971720053';
  }
}

function buildPatientConfirmationContent(data) {
  const whatsappNumber = getWhatsappNumber();
  const registerUrl = getDoctor8RegisterUrl();
  const waMsg = `Hola, envié mi solicitud SOS Venezuela. Mi protocolo es ${data.protocolo}. Necesito orientación.`;
  const waLink = `https://wa.me/${String(whatsappNumber).replace(/\D/g, '')}?text=${encodeURIComponent(waMsg)}`;
  const safeName = sanitizeDisplayName(data.nome) || 'estimado/a';

  const lines = [
    `Hola ${safeName},`,
    '',
    'Recibimos su solicitud de atención del SOS Salud Venezuela — ACURABRASIL.',
    '',
    `Su número de protocolo: ${data.protocolo}`,
    '',
    '¿Qué sucede ahora?',
    '- Si hay profesionales en línea, la atención puede ser inmediata cuando cree su cuenta en Doctor8 y entre en Atención Inmediata.',
    '- Si no hay profesionales disponibles en este momento, nuestro equipo de triaje le contactará en hasta 24 horas.',
    '',
    'Paso siguiente — crear su cuenta gratuita en Doctor8:',
    registerUrl,
    '',
    '¿Necesita ayuda? Escríbanos por WhatsApp con su protocolo:',
    waLink,
    '',
    'Importante: en caso de emergencia con riesgo de vida, llame al 911 (VEN-911) o acuda al hospital más cercano. La teleconsulta no sustituye la atención presencial de urgencia.',
    '',
    'Con gratitud,',
    'Equipo SOS Salud Venezuela — ACURABRASIL',
  ];

  return {
    subject: `[SOS Venezuela] Confirmación de solicitud — ${data.protocolo}`,
    text: lines.join('\n'),
  };
}

async function sendPatientConfirmationViaResend(data) {
  const { subject, text } = buildPatientConfirmationContent(data);
  const from = process.env.CONTACT_FROM || 'ACURABRASIL <contato@acurabrasil.org>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [data.email],
      reply_to: getRecipient(),
      subject,
      text,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('SOS Venezuela patient confirmation Resend error:', res.status, errBody);
    const err = new Error(`Resend ${res.status}`);
    err.code = 'RESEND_FAILED';
    throw err;
  }
}

async function sendPatientConfirmationViaSmtp(data) {
  const transporter = createTransporter();
  if (!transporter) {
    const err = new Error('SMTP not configured');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const { subject, text } = buildPatientConfirmationContent(data);
  const from = process.env.CONTACT_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from: `"SOS Venezuela ACURABRASIL" <${from}>`,
    to: data.email,
    replyTo: getRecipient(),
    subject,
    text,
  });
}

async function sendPatientConfirmationEmail(data) {
  const send = process.env.RESEND_API_KEY ? sendPatientConfirmationViaResend : sendPatientConfirmationViaSmtp;
  await withTimeout(send(data), SEND_TIMEOUT_MS, 'PATIENT_EMAIL');
}

function firePatientConfirmationEmail(data) {
  if (!isEmailConfigured()) return;
  void sendPatientConfirmationEmail(data).catch((err) => {
    console.error('SOS Venezuela patient confirmation failed:', err.code || err.message);
  });
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

  if (isIpRateLimited(ip)) {
    return res.status(429).json({
      ok: false,
      error: 'rate_limit',
      retryAfterSeconds: getIpRateLimitRetrySeconds(ip),
    });
  }

  const validation = validateBody(req.body || {});
  if (!validation.ok) {
    if (validation.silent) {
      console.warn('SOS Venezuela intake discarded:', validation.reason || 'honeypot', { ip });
      return res.json({ ok: true });
    }
    return res.status(400).json({ ok: false, error: validation.error, field: validation.field || null });
  }

  if (validation.data.clientRequestId) {
    try {
      const { findRecentIntakeByClientRequestId } = require('./sos-intake-store');
      const existing = findRecentIntakeByClientRequestId(validation.data.clientRequestId);
      if (existing) {
        return res.json({
          ok: true,
          protocolo: existing.protocolo,
          intakeToken: null,
        });
      }
    } catch (err) {
      console.error('SOS Venezuela intake idempotency lookup failed:', err.message);
    }
  }

  if (isEmailIpRateLimited(ip, validation.data.email)) {
    return res.status(429).json({
      ok: false,
      error: 'rate_limit',
      retryAfterSeconds: getEmailIpRateLimitRetrySeconds(ip, validation.data.email),
    });
  }

  let intakeToken = null;
  let dbOk = false;
  try {
    const { persistIntake } = require('./sos-intake-store');
    const persisted = persistIntake(validation.data);
    intakeToken = persisted.intakeToken;
    dbOk = true;
  } catch (err) {
    console.error('SOS Venezuela intake DB persist failed:', err.message);
  }

  const successPayload = {
    ok: true,
    protocolo: validation.data.protocolo,
    intakeToken,
  };

  if (!isEmailConfigured()) {
    if (dbOk) {
      console.warn('SOS Venezuela intake: email not configured but saved to DB');
      return res.json(successPayload);
    }
    console.error('SOS Venezuela intake: no email provider and DB failed');
    return res.status(503).json({ ok: false, error: 'unavailable' });
  }

  try {
    await sendIntakeEmail(validation.data);
    firePatientConfirmationEmail(validation.data);
    return res.json(successPayload);
  } catch (err) {
    console.error('SOS Venezuela intake send failed:', err.code || err.message);
    if (dbOk) {
      console.warn('SOS Venezuela intake: email failed but saved to DB', validation.data.protocolo);
      firePatientConfirmationEmail(validation.data);
      return res.json(successPayload);
    }
    return res.status(500).json({ ok: false, error: 'send_failed' });
  }
}

module.exports = {
  handleSosVenezuelaIntakeRequest,
  validateBody,
  normalizeEmail,
  rateLimitKey,
  isIpRateLimited,
  isEmailIpRateLimited,
  getIpRateLimitRetrySeconds,
  getEmailIpRateLimitRetrySeconds,
  parseVenezuelaWhatsApp,
  resolvePhoneFromBody,
  resolveUbicacionFromBody,
  buildPatientConfirmationContent,
  firePatientConfirmationEmail,
  _resetRateLimitsForTests,
  MIN_FILL_MS,
  IP_RATE_LIMIT_MAX,
};
