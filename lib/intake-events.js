const { getDb } = require('./db');
const { checkEmailRegistered } = require('./doctor8-api');
const { verifyIntakeToken } = require('./sos-intake-store');

const VALID_EVENTS = {
  doctor8_register: 'clicked_doctor8_register_at',
  doctor8_login: 'clicked_doctor8_login_at',
  whatsapp_help: 'clicked_whatsapp_help_at',
};

function denyIntakeEvent(res) {
  return res.status(404).send('Not Found');
}

function recordIntakeEvent(protocolo, event, token) {
  const column = VALID_EVENTS[event];
  if (!column) return { ok: false, error: 'invalid_event' };

  const db = getDb();
  const row = db
    .prepare('SELECT id, intake_token_hash FROM sos_intakes WHERE protocolo = ?')
    .get(protocolo);
  if (!row || !verifyIntakeToken(token, row.intake_token_hash)) {
    return { ok: false, error: 'not_found' };
  }

  db.prepare(
    `UPDATE sos_intakes SET ${column} = COALESCE(${column}, datetime('now')), updated_at = datetime('now') WHERE protocolo = ?`
  ).run(protocolo);

  try {
    const { schedulePatch } = require('./doctor8-sync');
    const eventMap = {
      doctor8_register: 'CLICKED_DOCTOR8_REGISTER',
      doctor8_login: 'CLICKED_DOCTOR8_LOGIN',
      whatsapp_help: 'CLICKED_WHATSAPP_HELP',
    };
    const type = eventMap[event];
    schedulePatch(protocolo, type
      ? [{
          externalId: `acura-event-${event}-${protocolo}`,
          type,
          occurredAt: new Date().toISOString(),
          payload: {},
        }]
      : undefined);
  } catch (syncErr) {
    console.error('Doctor8 sync click failed:', syncErr.message);
  }

  return { ok: true };
}

async function verifyDoctor8Email(protocolo) {
  const db = getDb();
  const row = db.prepare('SELECT id, email FROM sos_intakes WHERE protocolo = ?').get(protocolo);
  if (!row) return { ok: false, error: 'not_found' };

  const result = await checkEmailRegistered(row.email);
  const status = result.status || 'error';

  db.prepare(`
    UPDATE sos_intakes SET
      doctor8_email_checked_at = datetime('now'),
      doctor8_email_status = @status,
      doctor8_registered = CASE WHEN @registered = 1 THEN 1 ELSE doctor8_registered END,
      updated_at = datetime('now')
    WHERE protocolo = @protocolo
  `).run({
    protocolo,
    status,
    registered: result.registered ? 1 : 0,
  });

  if (result.registered) {
    db.prepare(`
      INSERT INTO sos_intake_log (intake_id, old_status, new_status, note, changed_by)
      SELECT id, status, status, 'Doctor8: e-mail confirmado via API', 'doctor8-api'
      FROM sos_intakes WHERE protocolo = ?
    `).run(protocolo);
  }

  try {
    const { schedulePatch } = require('./doctor8-sync');
    schedulePatch(protocolo);
  } catch (syncErr) {
    console.error('Doctor8 sync after email check failed:', syncErr.message);
  }

  return {
    ok: result.ok || result.status === 'not_found' || result.status === 'not_configured',
    configured: result.configured,
    status,
    registered: !!result.registered,
    error: result.error || null,
  };
}

function handleIntakeEventRequest(req, res) {
  const protocolo = String(req.params.protocolo || '').trim().slice(0, 64);
  const event = String(req.body?.event || '').trim();
  const token = String(req.headers['x-intake-token'] || '').trim();

  if (!protocolo || !event || !token) {
    return denyIntakeEvent(res);
  }

  const result = recordIntakeEvent(protocolo, event, token);
  if (!result.ok) {
    if (result.error === 'not_found') return denyIntakeEvent(res);
    return res.status(400).json({ ok: false, error: result.error });
  }
  return res.json({ ok: true });
}

module.exports = { recordIntakeEvent, verifyDoctor8Email, handleIntakeEventRequest, VALID_EVENTS };
