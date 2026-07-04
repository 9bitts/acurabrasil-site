const {
  getDb,
  getConfig,
  parseJsonArray,
  rowToVolunteer,
  rowToTemplate,
  formatDateLocal,
} = require('./db');
const { getDashboardSummary, getPublicInfo } = require('./sos-schedule');
const {
  requireAdmin,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminMe,
} = require('./admin-auth');

const VALID_STATUSES = [
  'nova',
  'em_triagem',
  'orientado_doctor8',
  'na_fila',
  'em_consulta',
  'concluido',
  'cancelado',
];
const VALID_ROLES = ['triagem', 'cadastro_wa', 'coordenador', 'backup'];

function sanitizeStr(val, max = 500) {
  return String(val || '')
    .replace(/[\r\n\t]/g, ' ')
    .trim()
    .slice(0, max);
}

function parsePhoneJson(str) {
  try {
    const v = JSON.parse(str);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function rowToIntake(row) {
  if (!row) return null;
  return {
    ...row,
    phone: parsePhoneJson(row.phone_json),
    doctor8_registered: !!row.doctor8_registered,
  };
}

function registerAdminRoutes(app) {
  app.post('/api/admin/login', handleAdminLogin);
  app.post('/api/admin/logout', handleAdminLogout);
  app.get('/api/admin/me', handleAdminMe);

  app.get('/api/sos-venezuela/public-info', (req, res) => {
    try {
      res.json(getPublicInfo());
    } catch (err) {
      console.error('public-info error:', err.message);
      res.status(500).json({ ok: false, error: 'server_error' });
    }
  });

  app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
    try {
      res.json({ ok: true, ...getDashboardSummary() });
    } catch (err) {
      console.error('dashboard error:', err.message);
      res.status(500).json({ ok: false, error: 'server_error' });
    }
  });

  app.get('/api/admin/config', requireAdmin, handleGetConfig);
  app.patch('/api/admin/config', requireAdmin, handlePatchConfig);

  app.get('/api/admin/volunteers', requireAdmin, handleListVolunteers);
  app.post('/api/admin/volunteers', requireAdmin, handleCreateVolunteer);
  app.patch('/api/admin/volunteers/:id', requireAdmin, handleUpdateVolunteer);
  app.delete('/api/admin/volunteers/:id', requireAdmin, handleDeleteVolunteer);

  app.get('/api/admin/shift-templates', requireAdmin, handleListTemplates);
  app.post('/api/admin/shift-templates', requireAdmin, handleCreateTemplate);
  app.patch('/api/admin/shift-templates/:id', requireAdmin, handleUpdateTemplate);
  app.delete('/api/admin/shift-templates/:id', requireAdmin, handleDeleteTemplate);

  app.get('/api/admin/schedule', requireAdmin, handleGetSchedule);
  app.post('/api/admin/schedule', requireAdmin, handleSaveScheduleRow);
  app.post('/api/admin/schedule/bulk', requireAdmin, handleBulkSchedule);
  app.get('/api/admin/schedule/export.csv', requireAdmin, handleExportScheduleCsv);

  app.get('/api/admin/intakes', requireAdmin, handleListIntakes);
  app.get('/api/admin/intakes/:protocolo', requireAdmin, handleGetIntake);
  app.patch('/api/admin/intakes/:protocolo', requireAdmin, handlePatchIntake);
}

function handleGetConfig(req, res) {
  const db = getDb();
  const config = getConfig(db);
  res.json({ ok: true, config });
}

function handlePatchConfig(req, res) {
  const db = getDb();
  const body = req.body || {};
  const fields = [];
  const params = { id: 1 };

  if (body.whatsapp_number != null) {
    fields.push('whatsapp_number = @whatsapp_number');
    params.whatsapp_number = sanitizeStr(body.whatsapp_number, 20).replace(/\D/g, '');
  }
  if (body.whatsapp_message_general != null) {
    fields.push('whatsapp_message_general = @whatsapp_message_general');
    params.whatsapp_message_general = sanitizeStr(body.whatsapp_message_general, 2000);
  }
  if (body.whatsapp_message_registro != null) {
    fields.push('whatsapp_message_registro = @whatsapp_message_registro');
    params.whatsapp_message_registro = sanitizeStr(body.whatsapp_message_registro, 2000);
  }
  if (body.timezone != null) {
    fields.push('timezone = @timezone');
    params.timezone = sanitizeStr(body.timezone, 64);
  }
  if (body.out_of_hours_message_es != null) {
    fields.push('out_of_hours_message_es = @out_of_hours_message_es');
    params.out_of_hours_message_es = sanitizeStr(body.out_of_hours_message_es, 4000);
  }
  if (body.out_of_hours_message_pt != null) {
    fields.push('out_of_hours_message_pt = @out_of_hours_message_pt');
    params.out_of_hours_message_pt = sanitizeStr(body.out_of_hours_message_pt, 4000);
  }

  if (!fields.length) {
    return res.status(400).json({ ok: false, error: 'no_fields' });
  }

  fields.push("updated_at = datetime('now')");
  db.prepare(`UPDATE sos_config SET ${fields.join(', ')} WHERE id = @id`).run(params);
  res.json({ ok: true, config: getConfig(db) });
}

function handleListVolunteers(req, res) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM sos_volunteers ORDER BY nome ASC').all();
  res.json({ ok: true, volunteers: rows.map(rowToVolunteer) });
}

function validateRoles(roles) {
  if (!Array.isArray(roles) || !roles.length) return false;
  return roles.every((r) => VALID_ROLES.includes(r));
}

function handleCreateVolunteer(req, res) {
  const body = req.body || {};
  const nome = sanitizeStr(body.nome, 200);
  const email = sanitizeStr(body.email, 254);
  const whatsapp = sanitizeStr(body.whatsapp, 20).replace(/\D/g, '');
  const roles = body.roles;
  const ativo = body.ativo !== false ? 1 : 0;

  if (!nome || !email || !whatsapp || !validateRoles(roles)) {
    return res.status(400).json({ ok: false, error: 'validation' });
  }

  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO sos_volunteers (nome, email, whatsapp, roles, ativo, updated_at)
       VALUES (@nome, @email, @whatsapp, @roles, @ativo, datetime('now'))`
    )
    .run({ nome, email, whatsapp, roles: JSON.stringify(roles), ativo });

  const row = db.prepare('SELECT * FROM sos_volunteers WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ok: true, volunteer: rowToVolunteer(row) });
}

function handleUpdateVolunteer(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ ok: false, error: 'invalid_id' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT * FROM sos_volunteers WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ ok: false, error: 'not_found' });

  const body = req.body || {};
  const fields = [];
  const params = { id };

  if (body.nome != null) {
    fields.push('nome = @nome');
    params.nome = sanitizeStr(body.nome, 200);
  }
  if (body.email != null) {
    fields.push('email = @email');
    params.email = sanitizeStr(body.email, 254);
  }
  if (body.whatsapp != null) {
    fields.push('whatsapp = @whatsapp');
    params.whatsapp = sanitizeStr(body.whatsapp, 20).replace(/\D/g, '');
  }
  if (body.roles != null) {
    if (!validateRoles(body.roles)) {
      return res.status(400).json({ ok: false, error: 'validation' });
    }
    fields.push('roles = @roles');
    params.roles = JSON.stringify(body.roles);
  }
  if (body.ativo != null) {
    fields.push('ativo = @ativo');
    params.ativo = body.ativo ? 1 : 0;
  }

  if (!fields.length) return res.status(400).json({ ok: false, error: 'no_fields' });

  fields.push("updated_at = datetime('now')");
  db.prepare(`UPDATE sos_volunteers SET ${fields.join(', ')} WHERE id = @id`).run(params);
  const row = db.prepare('SELECT * FROM sos_volunteers WHERE id = ?').get(id);
  res.json({ ok: true, volunteer: rowToVolunteer(row) });
}

function handleDeleteVolunteer(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ ok: false, error: 'invalid_id' });
  }
  const db = getDb();
  const result = db.prepare('DELETE FROM sos_volunteers WHERE id = ?').run(id);
  if (!result.changes) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true });
}

function handleListTemplates(req, res) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM sos_shift_templates ORDER BY ordem ASC').all();
  res.json({ ok: true, templates: rows.map(rowToTemplate) });
}

function handleCreateTemplate(req, res) {
  const body = req.body || {};
  const slug = sanitizeStr(body.slug, 64).toLowerCase().replace(/[^a-z0-9-]/g, '');
  const nome = sanitizeStr(body.nome, 200);
  const start_time = sanitizeStr(body.start_time, 5);
  const end_time = sanitizeStr(body.end_time, 5);
  const dias_semana = body.dias_semana;
  const role = sanitizeStr(body.role, 32);
  const ordem = Number(body.ordem) || 0;

  if (!slug || !nome || !start_time || !end_time || !VALID_ROLES.includes(role)) {
    return res.status(400).json({ ok: false, error: 'validation' });
  }
  if (!Array.isArray(dias_semana) || !dias_semana.length) {
    return res.status(400).json({ ok: false, error: 'validation' });
  }

  const db = getDb();
  try {
    const result = db
      .prepare(
        `INSERT INTO sos_shift_templates (slug, nome, start_time, end_time, dias_semana, role, ordem)
         VALUES (@slug, @nome, @start_time, @end_time, @dias_semana, @role, @ordem)`
      )
      .run({
        slug,
        nome,
        start_time,
        end_time,
        dias_semana: JSON.stringify(dias_semana),
        role,
        ordem,
      });
    const row = db.prepare('SELECT * FROM sos_shift_templates WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ ok: true, template: rowToTemplate(row) });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ ok: false, error: 'duplicate_slug' });
    }
    throw err;
  }
}

function handleUpdateTemplate(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ ok: false, error: 'invalid_id' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT * FROM sos_shift_templates WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ ok: false, error: 'not_found' });

  const body = req.body || {};
  const fields = [];
  const params = { id };

  if (body.slug != null) {
    fields.push('slug = @slug');
    params.slug = sanitizeStr(body.slug, 64).toLowerCase().replace(/[^a-z0-9-]/g, '');
  }
  if (body.nome != null) {
    fields.push('nome = @nome');
    params.nome = sanitizeStr(body.nome, 200);
  }
  if (body.start_time != null) {
    fields.push('start_time = @start_time');
    params.start_time = sanitizeStr(body.start_time, 5);
  }
  if (body.end_time != null) {
    fields.push('end_time = @end_time');
    params.end_time = sanitizeStr(body.end_time, 5);
  }
  if (body.dias_semana != null) {
    if (!Array.isArray(body.dias_semana) || !body.dias_semana.length) {
      return res.status(400).json({ ok: false, error: 'validation' });
    }
    fields.push('dias_semana = @dias_semana');
    params.dias_semana = JSON.stringify(body.dias_semana);
  }
  if (body.role != null) {
    if (!VALID_ROLES.includes(body.role)) {
      return res.status(400).json({ ok: false, error: 'validation' });
    }
    fields.push('role = @role');
    params.role = body.role;
  }
  if (body.ordem != null) {
    fields.push('ordem = @ordem');
    params.ordem = Number(body.ordem) || 0;
  }

  if (!fields.length) return res.status(400).json({ ok: false, error: 'no_fields' });

  try {
    db.prepare(`UPDATE sos_shift_templates SET ${fields.join(', ')} WHERE id = @id`).run(params);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ ok: false, error: 'duplicate_slug' });
    }
    throw err;
  }

  const row = db.prepare('SELECT * FROM sos_shift_templates WHERE id = ?').get(id);
  res.json({ ok: true, template: rowToTemplate(row) });
}

function handleDeleteTemplate(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ ok: false, error: 'invalid_id' });
  }
  const db = getDb();
  const result = db.prepare('DELETE FROM sos_shift_templates WHERE id = ?').run(id);
  if (!result.changes) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true });
}

function validateScheduleFk(db, shiftTemplateId, volunteerId) {
  const tpl = db.prepare('SELECT id, role FROM sos_shift_templates WHERE id = ?').get(shiftTemplateId);
  if (!tpl) return { ok: false, error: 'invalid_template' };
  if (volunteerId == null) return { ok: true };
  const vol = db.prepare('SELECT * FROM sos_volunteers WHERE id = ? AND ativo = 1').get(volunteerId);
  if (!vol) return { ok: false, error: 'invalid_volunteer' };
  const roles = parseJsonArray(vol.roles);
  const compatible =
    roles.includes(tpl.role) ||
    roles.includes('coordenador') ||
    roles.includes('backup') ||
    tpl.role === 'coordenador';
  if (!compatible && tpl.role !== 'coordenador') {
    return { ok: false, error: 'role_mismatch' };
  }
  return { ok: true };
}

function handleGetSchedule(req, res) {
  const from = req.query.from || formatDateLocal(new Date());
  const to = req.query.to || from;
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT s.*, t.nome AS template_nome, t.role AS template_role, t.start_time, t.end_time, t.ordem,
              v.nome AS volunteer_nome
       FROM sos_schedule s
       JOIN sos_shift_templates t ON t.id = s.shift_template_id
       LEFT JOIN sos_volunteers v ON v.id = s.volunteer_id
       WHERE s.date >= ? AND s.date <= ?
       ORDER BY s.date ASC, t.ordem ASC`
    )
    .all(from, to);

  const templates = db.prepare('SELECT * FROM sos_shift_templates ORDER BY ordem ASC').all();
  res.json({ ok: true, from, to, schedule: rows, templates: templates.map(rowToTemplate) });
}

function handleSaveScheduleRow(req, res) {
  const body = req.body || {};
  const date = sanitizeStr(body.date, 10);
  const shift_template_id = Number(body.shift_template_id);
  const volunteer_id = body.volunteer_id != null ? Number(body.volunteer_id) : null;
  const notes = sanitizeStr(body.notes, 500);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(shift_template_id)) {
    return res.status(400).json({ ok: false, error: 'validation' });
  }

  const db = getDb();
  const fk = validateScheduleFk(db, shift_template_id, volunteer_id);
  if (!fk.ok) return res.status(400).json({ ok: false, error: fk.error });

  db.prepare(
    `INSERT INTO sos_schedule (date, shift_template_id, volunteer_id, notes, updated_at)
     VALUES (@date, @shift_template_id, @volunteer_id, @notes, datetime('now'))
     ON CONFLICT(date, shift_template_id) DO UPDATE SET
       volunteer_id = excluded.volunteer_id,
       notes = excluded.notes,
       updated_at = datetime('now')`
  ).run({ date, shift_template_id, volunteer_id, notes });

  res.json({ ok: true });
}

function handleBulkSchedule(req, res) {
  const items = req.body?.items;
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ ok: false, error: 'validation' });
  }

  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO sos_schedule (date, shift_template_id, volunteer_id, notes, updated_at)
     VALUES (@date, @shift_template_id, @volunteer_id, @notes, datetime('now'))
     ON CONFLICT(date, shift_template_id) DO UPDATE SET
       volunteer_id = excluded.volunteer_id,
       notes = excluded.notes,
       updated_at = datetime('now')`
  );

  const tx = db.transaction((rows) => {
    for (const row of rows) {
      const date = sanitizeStr(row.date, 10);
      const shift_template_id = Number(row.shift_template_id);
      const volunteer_id = row.volunteer_id != null ? Number(row.volunteer_id) : null;
      const notes = sanitizeStr(row.notes, 500);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(shift_template_id)) {
        throw new Error('validation');
      }
      const fk = validateScheduleFk(db, shift_template_id, volunteer_id);
      if (!fk.ok) throw new Error(fk.error);
      upsert.run({ date, shift_template_id, volunteer_id, notes });
    }
  });

  try {
    tx(items);
    res.json({ ok: true, saved: items.length });
  } catch (err) {
    const code = err.message === 'validation' || err.message.includes('invalid') ? 400 : 500;
    res.status(code).json({ ok: false, error: err.message });
  }
}

function handleExportScheduleCsv(req, res) {
  const from = req.query.from || formatDateLocal(new Date());
  const to = req.query.to || from;
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT s.date, t.nome AS turno, t.start_time, t.end_time, t.role,
              COALESCE(v.nome, '') AS voluntario, s.notes
       FROM sos_schedule s
       JOIN sos_shift_templates t ON t.id = s.shift_template_id
       LEFT JOIN sos_volunteers v ON v.id = s.volunteer_id
       WHERE s.date >= ? AND s.date <= ?
       ORDER BY s.date ASC, t.ordem ASC`
    )
    .all(from, to);

  const escape = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
  const lines = ['date,turno,inicio,fim,papel,voluntario,notas'];
  for (const r of rows) {
    lines.push(
      [r.date, r.turno, r.start_time, r.end_time, r.role, r.voluntario, r.notes].map(escape).join(',')
    );
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="escala-sos-${from}-${to}.csv"`);
  res.send('\uFEFF' + lines.join('\n'));
}

function handleListIntakes(req, res) {
  const db = getDb();
  const conditions = [];
  const params = {};

  if (req.query.status && VALID_STATUSES.includes(req.query.status)) {
    conditions.push('i.status = @status');
    params.status = req.query.status;
  }
  if (req.query.prioridad) {
    conditions.push('i.prioridad = @prioridad');
    params.prioridad = sanitizeStr(req.query.prioridad, 32);
  }
  if (req.query.date) {
    conditions.push('date(i.created_at) = date(@date)');
    params.date = sanitizeStr(req.query.date, 10);
  }
  if (req.query.q) {
    conditions.push('(i.protocolo LIKE @q OR i.nome LIKE @q OR i.nome_paciente LIKE @q)');
    params.q = `%${sanitizeStr(req.query.q, 100)}%`;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT i.*, v.nome AS assigned_volunteer_nome
       FROM sos_intakes i
       LEFT JOIN sos_volunteers v ON v.id = i.assigned_volunteer_id
       ${where}
       ORDER BY i.created_at DESC
       LIMIT 200`
    )
    .all(params);

  res.json({ ok: true, intakes: rows.map(rowToIntake) });
}

function handleGetIntake(req, res) {
  const protocolo = sanitizeStr(req.params.protocolo, 64);
  const db = getDb();
  const row = db
    .prepare(
      `SELECT i.*, v.nome AS assigned_volunteer_nome
       FROM sos_intakes i
       LEFT JOIN sos_volunteers v ON v.id = i.assigned_volunteer_id
       WHERE i.protocolo = ?`
    )
    .get(protocolo);

  if (!row) return res.status(404).json({ ok: false, error: 'not_found' });

  const log = db
    .prepare(
      `SELECT * FROM sos_intake_log WHERE intake_id = ? ORDER BY changed_at DESC`
    )
    .all(row.id);

  res.json({ ok: true, intake: rowToIntake(row), log });
}

function handlePatchIntake(req, res) {
  const protocolo = sanitizeStr(req.params.protocolo, 64);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM sos_intakes WHERE protocolo = ?').get(protocolo);
  if (!existing) return res.status(404).json({ ok: false, error: 'not_found' });

  const body = req.body || {};
  const fields = [];
  const params = { protocolo };
  let statusChanged = false;
  let newStatus = existing.status;

  if (body.status != null) {
    if (!VALID_STATUSES.includes(body.status)) {
      return res.status(400).json({ ok: false, error: 'validation' });
    }
    fields.push('status = @status');
    params.status = body.status;
    statusChanged = body.status !== existing.status;
    newStatus = body.status;
  }
  if (body.triagem_notes != null) {
    fields.push('triagem_notes = @triagem_notes');
    params.triagem_notes = sanitizeStr(body.triagem_notes, 4000);
  }
  if (body.assigned_volunteer_id !== undefined) {
    const vid = body.assigned_volunteer_id;
    if (vid != null) {
      const vol = db.prepare('SELECT id FROM sos_volunteers WHERE id = ?').get(Number(vid));
      if (!vol) return res.status(400).json({ ok: false, error: 'invalid_volunteer' });
      params.assigned_volunteer_id = Number(vid);
    } else {
      params.assigned_volunteer_id = null;
    }
    fields.push('assigned_volunteer_id = @assigned_volunteer_id');
  }
  if (body.doctor8_registered != null) {
    fields.push('doctor8_registered = @doctor8_registered');
    params.doctor8_registered = body.doctor8_registered ? 1 : 0;
  }

  if (!fields.length) return res.status(400).json({ ok: false, error: 'no_fields' });

  fields.push("updated_at = datetime('now')");

  const tx = db.transaction(() => {
    db.prepare(`UPDATE sos_intakes SET ${fields.join(', ')} WHERE protocolo = @protocolo`).run(params);
    if (statusChanged) {
      db.prepare(
        `INSERT INTO sos_intake_log (intake_id, old_status, new_status, note, changed_by)
         VALUES (@intake_id, @old_status, @new_status, @note, @changed_by)`
      ).run({
        intake_id: existing.id,
        old_status: existing.status,
        new_status: newStatus,
        note: sanitizeStr(body.note || '', 500),
        changed_by: req.adminUser,
      });
    }
  });

  tx();
  const row = db.prepare('SELECT * FROM sos_intakes WHERE protocolo = ?').get(protocolo);
  res.json({ ok: true, intake: rowToIntake(row) });
}

module.exports = { registerAdminRoutes };
