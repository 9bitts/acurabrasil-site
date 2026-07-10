const { getDb } = require('./db');
const { buildPayloadFromIntake, buildPatchFromIntake } = require('./doctor8-intake-payload');

function isConfigured() {
  return !!(
    process.env.DOCTOR8_API_BASE_URL &&
    process.env.DOCTOR8_API_KEY
  );
}

function baseUrl() {
  return String(process.env.DOCTOR8_API_BASE_URL || '').replace(/\/$/, '');
}

async function doctor8Fetch(path, options = {}, retries = 2) {
  const url = `${baseUrl()}${path}`;
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${process.env.DOCTOR8_API_KEY}`,
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers,
  };

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...options, headers });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, data, status: res.status };
      lastError = new Error(`Doctor8 ${res.status}: ${JSON.stringify(data)}`);
      if (res.status >= 500 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      return { ok: false, data, status: res.status, error: lastError.message };
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
    }
  }
  return { ok: false, error: lastError?.message || 'network_error' };
}

function loadIntakeBundle(protocolo) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT i.*, v.nome AS assigned_volunteer_nome
       FROM sos_intakes i
       LEFT JOIN sos_volunteers v ON v.id = i.assigned_volunteer_id
       WHERE i.protocolo = ?`
    )
    .get(protocolo);
  if (!row) return null;
  const log = db
    .prepare(`SELECT * FROM sos_intake_log WHERE intake_id = ? ORDER BY changed_at ASC`)
    .all(row.id);
  return {
    row,
    log,
    volunteerLabel: row.assigned_volunteer_nome || null,
  };
}

async function pushIntakeByProtocolo(protocolo) {
  if (!isConfigured()) return { ok: false, skipped: true, reason: 'not_configured' };
  const bundle = loadIntakeBundle(protocolo);
  if (!bundle) return { ok: false, error: 'not_found' };

  const payload = buildPayloadFromIntake(bundle.row, bundle.log, bundle.volunteerLabel);
  const result = await doctor8Fetch('/api/integrations/acura/intakes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!result.ok) {
    console.error('[doctor8-sync] push failed', protocolo, result.error || result.data);
  }
  return result;
}

async function patchIntakeByProtocolo(protocolo, extraEvents) {
  if (!isConfigured()) return { ok: false, skipped: true, reason: 'not_configured' };
  const bundle = loadIntakeBundle(protocolo);
  if (!bundle) return { ok: false, error: 'not_found' };

  const patch = buildPatchFromIntake(
    bundle.row,
    bundle.log,
    bundle.volunteerLabel,
    extraEvents
  );
  const result = await doctor8Fetch(
    `/api/integrations/acura/intakes/${encodeURIComponent(protocolo)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }
  );
  if (!result.ok) {
    console.error('[doctor8-sync] patch failed', protocolo, result.error || result.data);
  }
  return result;
}

function scheduleSync(fn) {
  setImmediate(() => {
    fn().catch((err) => console.error('[doctor8-sync] async error', err.message));
  });
}

function schedulePush(protocolo) {
  scheduleSync(() => pushIntakeByProtocolo(protocolo));
}

function schedulePatch(protocolo, extraEvents) {
  scheduleSync(() => patchIntakeByProtocolo(protocolo, extraEvents));
}

module.exports = {
  isConfigured,
  pushIntakeByProtocolo,
  patchIntakeByProtocolo,
  schedulePush,
  schedulePatch,
  loadIntakeBundle,
};
