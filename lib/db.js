const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 3;
const DEFAULT_WA_GENERAL = 'Hola, necesito atención gratuita del SOS Venezuela';
const DEFAULT_WA_REGISTRO = 'Hola, necesito ayuda para registrarme en el SOS Venezuela';
const DEFAULT_OUT_OF_HOURS_ES =
  'Gracias por contactar SOS Venezuela — ACURABRASIL. Nuestro equipo de voluntarios atiende de lunes a domingo, 9:00–12:00 y 14:00–18:00 (hora de Brasilia). Si ya completó el formulario, guarde su número de protocolo. En emergencia grave: en Venezuela llame al 911 (VEN-911); en Brasil, al 192 (SAMU) o 188 (CVV).';
const DEFAULT_OUT_OF_HOURS_PT =
  'Obrigado por contactar o SOS Venezuela — ACURABRASIL. Nossa equipe de voluntários atende de segunda a domingo, 9:00–12:00 e 14:00–18:00 (horário de Brasília). Se já preencheu o formulário, guarde seu número de protocolo. Em emergência grave: na Venezuela ligue 911 (VEN-911); no Brasil, 192 (SAMU) ou 188 (CVV).';

const DEFAULT_LISTING_TITULO = 'SOS Salud Venezuela — Consultas médicas y psicológicas gratuitas';
const DEFAULT_LISTING_SUBTITULO =
  'Telemedicina humanitaria de ACURABRASIL para víctimas de los terremotos';
const DEFAULT_LISTING_DESC_CURTA =
  'Consultas médicas y psicológicas en línea, 100% gratuitas, para víctimas de los terremotos en Venezuela. Complete el formulario de solicitud y acceda vía Doctor8 con profesionales voluntarios certificados.';
const DEFAULT_LISTING_DESC_LONGA = `SOS Salud Venezuela es un proyecto humanitario de ACURABRASIL que ofrece consultas médicas y psicológicas en línea, 100% gratuitas, para víctimas de los terremotos de junio de 2026 en Venezuela.

Cómo acceder:
1. Complete el formulario de solicitud en nuestro sitio web
2. Cree su cuenta gratuita en la plataforma Doctor8
3. Entre en Atención Inmediata y elija un profesional voluntario disponible

Atendemos emergencias emocionales, evaluación de lesiones, orientación sobre medicamentos y derivación cuando sea necesario. Operamos con voluntarios certificados (CFM/CRP) y seguimos el modelo probado del SOS Salud Río Grande do Sul (2.664 solicitudes de consulta en 2024, más de 6.000 personas beneficiadas).

Horarios de orientación por WhatsApp: consulte el sitio web para turnos actuales.`;
const DEFAULT_LISTING_CATEGORIAS = JSON.stringify(['Salud', 'Telemedicina', 'Ayuda humanitaria', 'Salud mental']);
const DEFAULT_LISTING_PALAVRAS = JSON.stringify([
  'Venezuela',
  'terremoto',
  'telemedicina',
  'salud mental',
  'consulta gratuita',
  'ACURABRASIL',
  'Doctor8',
]);

const DEFAULT_TEMPLATE_PARCERIA_ONG = `Prezados(as),

Somos a ACURABRASIL (Associação Brasil pela Cura), OSCIP certificada, e gostaríamos de apresentar o SOS Salud Venezuela — projeto de telemedicina humanitária 100% gratuita para vítimas dos terremotos de junio de 2026 na Venezuela.

Oferecemos consultas médicas e psicológicas en línea, com triagem humanizada e atendimento via plataforma Doctor8, seguindo o modelo do SOS Salud Río Grande do Sul (2.664 solicitações de consulta em 2024, mais de 6.000 pessoas beneficiadas).

Link para encaminhamento de pacientes:
{link_solicitud}

Site: https://www.acurabrasil.org/sos-venezuela
Contato: contato@acurabrasil.org

Ficamos à disposição para conversar sobre parceria de encaminhamento e divulgação.

Atenciosamente,
Equipe ACURABRASIL`;

const DEFAULT_TEMPLATE_IGREJA = `Prezado(a) pastor(a) / responsável pela comunidade,

A ACURABRASIL, associação humanitária sem fins lucrativos, oferece o SOS Salud Venezuela — atendimento médico e psicológico gratuito por telemedicina para venezuelanos afetados pelos terremotos.

Pedimos ajuda para divulgar entre famílias venezuelanas da comunidade. O acesso é simples:
1. Formulário de solicitud (link abaixo)
2. Registro gratuito em Doctor8
3. Consulta com voluntário disponível

Link para compartilhar (em espanhol):
{link_solicitud}

Material em espanhol disponível no site. Qualquer dúvida: contato@acurabrasil.org

Com gratidão,
ACURABRASIL`;

const DEFAULT_TEMPLATE_ASSOCIACAO = `Prezados(as) membros da diretoria,

A ACURABRASIL convida sua associação a conhecer o SOS Salud Venezuela — consultas médicas y psicológicas gratuitas en línea para connacionales afectados por los terremotos.

Podemos fornecer material de divulgação em espanhol e link exclusivo para rastrear encaminhamentos da sua entidade:

{link_solicitud}

Interessados em parceria: contato@acurabrasil.org | contato@acurabrasil.org

CNPJ: 30.350.850/0001-80
ACURABRASIL — Associação Brasil pela Cura`;

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

  if (current < 1) applyMigrationV1(db);
  if (current < 2) applyMigrationV2(db);
  if (current < 3) applyMigrationV3(db);
  if (current < 4) applyMigrationV4(db);
  if (current < 5) applyMigrationV5(db);
  if (current < 6) applyMigrationV6(db);
  if (current < 7) applyMigrationV7(db);
  if (current < 8) applyMigrationV8(db);
  if (current < 9) applyMigrationV9(db);
}

function setSchemaVersion(db, version) {
  db.prepare('INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)').run('version', String(version));
}

function applyMigrationV1(db) {
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
  setSchemaVersion(db, 1);
}

function applyMigrationV2(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sos_hubs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      url_site TEXT NOT NULL,
      url_cadastro TEXT,
      categoria TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pendente',
      data_cadastro TEXT,
      url_listagem_publicada TEXT,
      notas TEXT NOT NULL DEFAULT '',
      ordem INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sos_listing_kit (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      titulo_es TEXT NOT NULL,
      subtitulo_es TEXT NOT NULL,
      descricao_curta_es TEXT NOT NULL,
      descricao_longa_es TEXT NOT NULL,
      categorias_es TEXT NOT NULL,
      palavras_chave_es TEXT NOT NULL,
      organizacao TEXT NOT NULL,
      cnpj TEXT NOT NULL,
      email_contato TEXT NOT NULL,
      cobertura TEXT NOT NULL,
      idioma_atendimento TEXT NOT NULL,
      costo TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  seedHubsIfEmpty(db);
  seedListingKitIfEmpty(db);
  setSchemaVersion(db, 2);
}

function applyMigrationV3(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sos_partnerships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL,
      contato_nome TEXT NOT NULL DEFAULT '',
      contato_email TEXT NOT NULL DEFAULT '',
      contato_telefone TEXT NOT NULL DEFAULT '',
      contato_url TEXT,
      regiao TEXT,
      status TEXT NOT NULL DEFAULT 'nao_contatado',
      data_primeiro_contato TEXT,
      data_ultimo_contato TEXT,
      data_proxima_acao TEXT,
      notas TEXT NOT NULL DEFAULT '',
      checklist_item INTEGER NOT NULL DEFAULT 0,
      ordem INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sos_partnership_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partnership_id INTEGER NOT NULL REFERENCES sos_partnerships(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sos_metrics_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start TEXT NOT NULL UNIQUE,
      intakes_total INTEGER NOT NULL DEFAULT 0,
      intakes_nova INTEGER NOT NULL DEFAULT 0,
      intakes_concluido INTEGER NOT NULL DEFAULT 0,
      hubs_publicados INTEGER NOT NULL DEFAULT 0,
      notas TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sos_email_templates (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      template_parceria_ong_pt TEXT NOT NULL,
      template_igreja_pt TEXT NOT NULL,
      template_associacao_pt TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_partnership_log_pid ON sos_partnership_log(partnership_id);
    CREATE INDEX IF NOT EXISTS idx_metrics_week ON sos_metrics_snapshots(week_start);
  `);

  const intakeCols = db.prepare('PRAGMA table_info(sos_intakes)').all();
  if (!intakeCols.some((c) => c.name === 'referral_source')) {
    db.exec('ALTER TABLE sos_intakes ADD COLUMN referral_source TEXT');
  }

  seedPartnershipsIfEmpty(db);
  seedEmailTemplatesIfEmpty(db);
  setSchemaVersion(db, 3);
}

function applyMigrationV4(db) {
  db.prepare(`
    UPDATE sos_hubs SET
      nome = 'Venezuela Ayuda (Vercel)',
      url_site = 'https://venezuela-ayuda.vercel.app',
      url_cadastro = 'https://venezuela-ayuda.vercel.app/puedo-ayudar',
      categoria = 'Coordinación de emergencia',
      notas = 'O domínio venezuela-ayuda.org não existe. Plataforma cívica hospedada em Vercel.',
      updated_at = datetime('now')
    WHERE slug = 'venezuela-ayuda'
  `).run();

  db.prepare(`
    UPDATE sos_hubs SET
      url_cadastro = 'https://reconstruyamosvenezuela.org',
      notas = 'Formulário "Proponer campaña" no rodapé do site.',
      updated_at = datetime('now')
    WHERE slug = 'reconstruyamos'
  `).run();

  db.prepare(`
    UPDATE sos_hubs SET
      url_cadastro = 'https://info-central-terremoto-venezuela.com',
      notas = 'Solicitar inclusão na seção Links de ayuda (atención médica/psicológica).',
      updated_at = datetime('now')
    WHERE slug = 'info-central'
  `).run();

  db.prepare(`
    UPDATE sos_hubs SET
      url_cadastro = 'https://ayudaavenezuela.org',
      notas = 'Prioridade telemedicina: botão "Postula tu iniciativa", categoria Salud.',
      updated_at = datetime('now')
    WHERE slug = 'ayudaavenezuela'
  `).run();

  db.prepare(`
    UPDATE sos_hubs SET
      nome = 'Venezuela Ayuda (Vercel)',
      url_site = 'https://venezuela-ayuda.vercel.app',
      url_cadastro = COALESCE(NULLIF(url_cadastro, ''), 'https://venezuela-ayuda.vercel.app/puedo-ayudar'),
      updated_at = datetime('now')
    WHERE url_site LIKE '%venezuela-ayuda.org%'
  `).run();

  setSchemaVersion(db, 4);
}

function applyMigrationV5(db) {
  const cols = db.prepare('PRAGMA table_info(sos_intakes)').all();
  const addCol = (name, ddl) => {
    if (!cols.some((c) => c.name === name)) {
      db.exec(`ALTER TABLE sos_intakes ADD COLUMN ${ddl}`);
    }
  };

  addCol('clicked_doctor8_register_at', 'clicked_doctor8_register_at TEXT');
  addCol('clicked_doctor8_login_at', 'clicked_doctor8_login_at TEXT');
  addCol('clicked_whatsapp_help_at', 'clicked_whatsapp_help_at TEXT');
  addCol('doctor8_email_checked_at', 'doctor8_email_checked_at TEXT');
  addCol('doctor8_email_status', 'doctor8_email_status TEXT');

  setSchemaVersion(db, 5);
}

function applyMigrationV6(db) {
  const cols = db.prepare('PRAGMA table_info(sos_intakes)').all();
  const addCol = (name, ddl) => {
    if (!cols.some((c) => c.name === name)) {
      db.exec(`ALTER TABLE sos_intakes ADD COLUMN ${ddl}`);
    }
  };

  addCol('lgpd_privacy_accepted', 'lgpd_privacy_accepted INTEGER NOT NULL DEFAULT 0');
  addCol('lgpd_privacy_version', 'lgpd_privacy_version TEXT');
  addCol('lgpd_privacy_at', 'lgpd_privacy_at TEXT');

  setSchemaVersion(db, 6);
}

function applyMigrationV7(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      confirm_token TEXT NOT NULL UNIQUE,
      confirmed INTEGER NOT NULL DEFAULT 0,
      lgpd_privacy_version TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      confirmed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(email);
    CREATE INDEX IF NOT EXISTS idx_newsletter_token ON newsletter_subscribers(confirm_token);
  `);
  setSchemaVersion(db, 7);
}

function applyMigrationV8(db) {
  db.exec(`
    DROP TABLE IF EXISTS sos_intake_log;
    DROP TABLE IF EXISTS sos_intakes;

    CREATE TABLE sos_intakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      protocolo TEXT NOT NULL UNIQUE,
      intake_token_hash BLOB NOT NULL,
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
      referral_source TEXT,
      clicked_doctor8_register_at TEXT,
      clicked_doctor8_login_at TEXT,
      clicked_whatsapp_help_at TEXT,
      doctor8_email_checked_at TEXT,
      doctor8_email_status TEXT,
      lgpd_privacy_accepted INTEGER NOT NULL DEFAULT 0,
      lgpd_privacy_version TEXT,
      lgpd_privacy_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE sos_intake_log (
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
  `);
  console.log('Migration v8: sos_intakes recreated with intake_token_hash (previous intake records cleared)');
  setSchemaVersion(db, 8);
}

function applyMigrationV9(db) {
  // Campos sensíveis de saúde passam a AES-256-GCM (lib/field-crypto.js).
  // Registros de teste em texto claro são descartados — sem dados reais a preservar.
  db.exec('DELETE FROM sos_intake_log');
  db.exec('DELETE FROM sos_intakes');
  console.log('Migration v9: intakes de teste removidos; novos registros serão cifrados em repouso');
  setSchemaVersion(db, 9);
}

function seedPartnershipsIfEmpty(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM sos_partnerships').get().c;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO sos_partnerships (slug, nome, tipo, regiao, checklist_item, ordem, status, updated_at)
    VALUES (@slug, @nome, @tipo, @regiao, @checklist_item, @ordem, 'nao_contatado', datetime('now'))
  `);

  const partners = [
    { slug: 'acnur', nome: 'ACNUR Brasil / Operação Acolhida', tipo: 'ong_internacional', checklist_item: 9, regiao: 'Nacional', ordem: 1 },
    { slug: 'caritas', nome: 'Cáritas Brasil', tipo: 'ong_nacional', checklist_item: 10, regiao: 'Nacional', ordem: 2 },
    { slug: 'avsi', nome: 'AVSI Brasil', tipo: 'ong_nacional', checklist_item: 11, regiao: 'Nacional', ordem: 3 },
    { slug: 'fsf', nome: 'Fraternidade Sem Fronteiras', tipo: 'ong_nacional', checklist_item: 12, regiao: 'Nacional', ordem: 4 },
    { slug: 'venez-brasil', nome: 'Associações venezuelanas (mapear)', tipo: 'associacao', checklist_item: 13, regiao: 'Nacional', ordem: 5 },
    { slug: 'igrejas-norte', nome: 'Igrejas — Boa Vista e Manaus', tipo: 'igreja', checklist_item: 14, regiao: 'Boa Vista/Manaus', ordem: 6 },
    { slug: 'igrejas-sp', nome: 'Igrejas — São Paulo', tipo: 'igreja', checklist_item: 14, regiao: 'São Paulo/SP', ordem: 7 },
  ];
  for (const p of partners) insert.run(p);
}

function seedEmailTemplatesIfEmpty(db) {
  const row = db.prepare('SELECT id FROM sos_email_templates WHERE id = 1').get();
  if (row) return;

  db.prepare(`
    INSERT INTO sos_email_templates (id, template_parceria_ong_pt, template_igreja_pt, template_associacao_pt, updated_at)
    VALUES (1, @ong, @igreja, @associacao, datetime('now'))
  `).run({
    ong: DEFAULT_TEMPLATE_PARCERIA_ONG,
    igreja: DEFAULT_TEMPLATE_IGREJA,
    associacao: DEFAULT_TEMPLATE_ASSOCIACAO,
  });
}

function seedHubsIfEmpty(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM sos_hubs').get().c;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO sos_hubs (slug, nome, url_site, url_cadastro, categoria, notas, status, ordem, updated_at)
    VALUES (@slug, @nome, @url_site, @url_cadastro, @categoria, @notas, 'pendente', @ordem, datetime('now'))
  `);

  const hubs = [
    {
      slug: 'venezuela-ayuda',
      nome: 'Venezuela Ayuda (Vercel)',
      url_site: 'https://venezuela-ayuda.vercel.app',
      url_cadastro: 'https://venezuela-ayuda.vercel.app/puedo-ayudar',
      categoria: 'Coordinación de emergencia',
      notas: 'venezuela-ayuda.org não existe — usar Vercel.',
      ordem: 1,
    },
    {
      slug: 'reconstruyamos',
      nome: 'Reconstruyamos Venezuela',
      url_site: 'https://reconstruyamosvenezuela.org',
      url_cadastro: 'https://reconstruyamosvenezuela.org',
      categoria: 'Hub humanitario / campañas',
      notas: 'Formulário "Proponer campaña" no rodapé.',
      ordem: 2,
    },
    {
      slug: 'info-central',
      nome: 'Info Central Terremoto Venezuela',
      url_site: 'https://info-central-terremoto-venezuela.com',
      url_cadastro: 'https://info-central-terremoto-venezuela.com',
      categoria: 'Agregador / links de ayuda',
      notas: 'Seção Links de ayuda.',
      ordem: 3,
    },
    {
      slug: 'ayudaavenezuela',
      nome: 'Ayuda a Venezuela',
      url_site: 'https://ayudaavenezuela.org',
      url_cadastro: 'https://ayudaavenezuela.org',
      categoria: 'Directorio de iniciativas',
      notas: 'Postula tu iniciativa — categoria Salud.',
      ordem: 4,
    },
  ];
  for (const h of hubs) insert.run(h);
}

function seedListingKitIfEmpty(db) {
  const row = db.prepare('SELECT id FROM sos_listing_kit WHERE id = 1').get();
  if (row) return;

  db.prepare(`
    INSERT INTO sos_listing_kit (
      id, titulo_es, subtitulo_es, descricao_curta_es, descricao_longa_es,
      categorias_es, palavras_chave_es, organizacao, cnpj, email_contato,
      cobertura, idioma_atendimento, costo, updated_at
    ) VALUES (
      1, @titulo_es, @subtitulo_es, @descricao_curta_es, @descricao_longa_es,
      @categorias_es, @palavras_chave_es, @organizacao, @cnpj, @email_contato,
      @cobertura, @idioma_atendimento, @costo, datetime('now')
    )
  `).run({
    titulo_es: DEFAULT_LISTING_TITULO,
    subtitulo_es: DEFAULT_LISTING_SUBTITULO,
    descricao_curta_es: DEFAULT_LISTING_DESC_CURTA,
    descricao_longa_es: DEFAULT_LISTING_DESC_LONGA,
    categorias_es: DEFAULT_LISTING_CATEGORIAS,
    palavras_chave_es: DEFAULT_LISTING_PALAVRAS,
    organizacao: 'ACURABRASIL (Associação Brasil pela Cura)',
    cnpj: '30.350.850/0001-80',
    email_contato: 'contato@acurabrasil.org',
    cobertura: 'Venezuela (atención remota desde Brasil)',
    idioma_atendimento: 'Español',
    costo: '100% gratuito',
  });
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
  seedHubsIfEmpty(db);
  seedListingKitIfEmpty(db);
  seedPartnershipsIfEmpty(db);
  seedEmailTemplatesIfEmpty(db);
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
  const { decryptIntakeRow } = require('./field-crypto');
  const decrypted = decryptIntakeRow(row);
  let phone = {};
  try {
    phone = typeof decrypted.phone_json === 'string' ? JSON.parse(decrypted.phone_json) : decrypted.phone_json || {};
  } catch {
    phone = {};
  }
  return {
    ...decrypted,
    phone,
    doctor8_registered: !!decrypted.doctor8_registered,
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
