const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const DEFAULT_WA_GENERAL = 'Hola%2C%20necesito%20atenci%C3%B3n%20gratuita%20del%20SOS%20Venezuela';
const DEFAULT_WA_REGISTRO = 'Hola%2C%20necesito%20ayuda%20para%20registrarme%20en%20el%20SOS%20Venezuela';
const DEFAULT_OUT_OF_HOURS_ES =
  'Gracias por contactar SOS Venezuela — ACURA Brasil. Nuestro equipo de voluntarios atiende de lunes a domingo, 9:00–12:00 y 14:00–18:00 (hora de Brasilia). Si ya completó el formulario, guarde su número de protocolo. Si es emergencia grave con riesgo de vida, busque atención presencial urgente.';
const DEFAULT_OUT_OF_HOURS_PT =
  'Obrigado por contactar o SOS Venezuela — ACURA Brasil. Nossa equipe de voluntários atende de segunda a domingo, 9:00–12:00 e 14:00–18:00 (horário de Brasília). Se já preencheu o formulário, guarde seu número de protocolo. Se for emergência grave com risco de vida, busque atendimento presencial urgente.';

let dbInstance = null;

function getDbPath() {
  const configured = process.env.DATA_PATH;
  if (configured) return path.resolve(configured);
  return path.join(__dirname, '..', 'data', 'acura-sos.db');
}

function getDb() {
  if (dbInstance) return dbInstance;
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  migrate(dbInstance);
  seedIfEmpty(dbInstance);
  return dbInstance;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const row = db.prepare('SELECT value FROM schema_meta WHERE key = ?').get('version');
  const current = row ? Number(row.value) : 0;
  if (current >= SCHEMA_VERSION) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS sos_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      whatsapp_number TEXT NOT NULL DEFAULT '5531971720053',
      whatsapp_message_general TEXT NOT NULL,
      whatsapp_message_registro TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
      out_of_hours_message_es TEXT NOT NULL,
      out_of_hours_message_pt TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sos_shift_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      dias_semana TEXT NOT NULL,
      role TEXT NOT NULL,
      ordem INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sos_volunteers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      roles TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sos_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      shift_template_id INTEGER NOT NULL REFERENCES sos_shift_templates(id) ON DELETE CASCADE,
      volunteer_id INTEGER REFERENCES sos_volunteers(id) ON DELETE SET NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(date, shift_template_id)
    );

    CREATE TABLE IF NOT EXISTS sos_intakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      protocolo TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      nome TEXT NOT NULL,
      email TEXT NOT NULL,
      phone_json TEXT NOT NULL,
      relacion TEXT NOT NULL,
      nome_paciente TEXT NOT NULL,
      edad INTEGER,
      ubicacion TEXT NOT NULL,
      tipo_atencion TEXT NOT NULL,
      prioridad TEXT NOT NULL,
      sintomas TEXT NOT NULL,
      observaciones TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'nova',
      triagem_notes TEXT NOT NULL DEFAULT '',
      assigned_volunteer_id INTEGER REFERENCES sos_volunteers(id) ON DELETE SET NULL,
      doctor8_registered INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sos_intake_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      intake_id INTEGER NOT NULL REFERENCES sos_intakes(id) ON DELETE CASCADE,
      old_status TEXT,
      new_status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      changed_by TEXT NOT NULL DEFAULT 'system',
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_intakes_status ON sos_intakes(status);
    CREATE INDEX IF NOT EXISTS idx_intakes_created ON sos_intakes(created_at);
    CREATE INDEX IF NOT EXISTS idx_schedule_date ON sos_schedule(date);
  `);

  db.prepare('INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)').run(
    'version',
    String(SCHEMA_VERSION)
  );
}

function formatDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function seedIfEmpty(db) {
  const tplCount = db.prepare('SELECT COUNT(*) AS c FROM sos_shift_templates').get().c;
  if (tplCount > 0) return;

  const insertTpl = db.prepare(`
    INSERT INTO sos_shift_templates (slug, nome, start_time, end_time, dias_semana, role, ordem)
    VALUES (@slug, @nome, @start_time, @end_time, @dias_semana, @role, @ordem)
  `);

  const templates = [
    { slug: 'manha', nome: 'Turno Manhã', start_time: '09:00', end_time: '12:00', dias_semana: JSON.stringify([1, 2, 3, 4, 5, 6, 0]), role: 'triagem', ordem: 1 },
    { slug: 'tarde', nome: 'Turno Tarde', start_time: '14:00', end_time: '18:00', dias_semana: JSON.stringify([1, 2, 3, 4, 5, 6, 0]), role: 'triagem', ordem: 2 },
    { slug: 'manha-wa', nome: 'WhatsApp Manhã', start_time: '09:00', end_time: '12:00', dias_semana: JSON.stringify([1, 2, 3, 4, 5, 6, 0]), role: 'cadastro_wa', ordem: 3 },
    { slug: 'tarde-wa', nome: 'WhatsApp Tarde', start_time: '14:00', end_time: '18:00', dias_semana: JSON.stringify([1, 2, 3, 4, 5, 6, 0]), role: 'cadastro_wa', ordem: 4 },
  ];
  for (const t of templates) insertTpl.run(t);

  const insertVol = db.prepare(`
    INSERT INTO sos_volunteers (nome, email, whatsapp, roles, ativo)
    VALUES (@nome, @email, @whatsapp, @roles, 1)
  `);
  const volunteers = [
    { nome: 'Coordenação SOS', email: 'contato@acurabrasil.org', whatsapp: '5531999990001', roles: JSON.stringify(['coordenador']) },
    { nome: 'Anjo Triagem — João', email: 'joao.exemplo@email.com', whatsapp: '5531999990002', roles: JSON.stringify(['triagem']) },
    { nome: 'Anjo WhatsApp — Ana', email: 'ana.exemplo@email.com', whatsapp: '5531999990003', roles: JSON.stringify(['cadastro_wa']) },
    { nome: 'Anjo Backup — Maria', email: 'maria.exemplo@email.com', whatsapp: '5531999990004', roles: JSON.stringify(['triagem', 'cadastro_wa']) },
  ];
  for (const v of volunteers) insertVol.run(v);

  db.prepare(`
    INSERT INTO sos_config (id, whatsapp_number, whatsapp_message_general, whatsapp_message_registro,
      timezone, out_of_hours_message_es, out_of_hours_message_pt, updated_at)
    VALUES (1, '5531971720053', ?, ?, 'America/Sao_Paulo', ?, ?, datetime('now'))
  `).run(DEFAULT_WA_GENERAL, DEFAULT_WA_REGISTRO, DEFAULT_OUT_OF_HOURS_ES, DEFAULT_OUT_OF_HOURS_PT);

  const tplIds = db.prepare('SELECT id, slug FROM sos_shift_templates ORDER BY ordem').all();
  const idBySlug = Object.fromEntries(tplIds.map((r) => [r.slug, r.id]));

  const insertSched = db.prepare(`
    INSERT INTO sos_schedule (date, shift_template_id, volunteer_id, notes)
    VALUES (@date, @shift_template_id, @volunteer_id, @notes)
  `);

  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = formatDateLocal(d);
    insertSched.run({ date: dateStr, shift_template_id: idBySlug.manha, volunteer_id: 2, notes: 'Coordenador responsável: Coordenação SOS' });
    insertSched.run({
      date: dateStr,
      shift_template_id: idBySlug.tarde,
      volunteer_id: i % 2 === 0 ? 2 : 4,
      notes: '',
    });
    insertSched.run({ date: dateStr, shift_template_id: idBySlug['manha-wa'], volunteer_id: 3, notes: '' });
    insertSched.run({ date: dateStr, shift_template_id: idBySlug['tarde-wa'], volunteer_id: 3, notes: '' });
  }

  console.log('SOS DB: seed de exemplo criada em', getDbPath());
}

function getConfig(db) {
  return db.prepare('SELECT * FROM sos_config WHERE id = 1').get();
}

function parseJsonArray(str, fallback = []) {
  if (Array.isArray(str)) return str;
  try {
    const v = JSON.parse(str);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function rowToVolunteer(row) {
  if (!row) return null;
  return { ...row, roles: parseJsonArray(row.roles), ativo: !!row.ativo };
}

function rowToTemplate(row) {
  if (!row) return null;
  return { ...row, dias_semana: parseJsonArray(row.dias_semana) };
}

function rowToIntake(row) {
  if (!row) return null;
  let phone = {};
  try {
    phone = typeof row.phone_json === 'string' ? JSON.parse(row.phone_json) : row.phone_json || {};
  } catch {
    phone = {};
  }
  return {
    ...row,
    phone,
    doctor8_registered: !!row.doctor8_registered,
  };
}

module.exports = {
  getDb,
  getDbPath,
  getConfig,
  parseJsonArray,
  rowToVolunteer,
  rowToTemplate,
  rowToIntake,
  formatDateLocal,
  DEFAULT_WA_GENERAL,
  DEFAULT_WA_REGISTRO,
};
