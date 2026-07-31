const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { DOCTOR8_WABA_WHATSAPP_E164 } = require('./whatsapp-contact');

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
  if (current < 10) applyMigrationV10(db);
  if (current < 11) applyMigrationV11(db);
  if (current < 12) applyMigrationV12(db);
  if (current < 13) applyMigrationV13(db);
  if (current < 14) applyMigrationV14(db);
  if (current < 15) applyMigrationV15(db);
  if (current < 16) applyMigrationV16(db);
  if (current < 17) applyMigrationV17(db);
  if (current < 18) applyMigrationV18(db);
  if (current < 19) applyMigrationV19(db);
  if (current < 20) applyMigrationV20(db);
  if (current < 21) applyMigrationV21(db);
  if (current < 22) applyMigrationV22(db);
  if (current < 23) applyMigrationV23(db);
  if (current < 24) applyMigrationV24(db);
  if (current < 25) applyMigrationV25(db);
  if (current < 26) applyMigrationV26(db);
}

function setSchemaVersion(db, version) {
  db.prepare('INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)').run('version', String(version));
}

function applyMigrationV1(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sos_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      whatsapp_number TEXT NOT NULL DEFAULT '491749803699',
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

function applyMigrationV10(db) {
  const cols = db.prepare('PRAGMA table_info(sos_intakes)').all();
  if (!cols.some((c) => c.name === 'client_request_id')) {
    db.exec('ALTER TABLE sos_intakes ADD COLUMN client_request_id TEXT');
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_intakes_client_request_id ON sos_intakes(client_request_id, created_at)'
    );
  }
  setSchemaVersion(db, 10);
}

function applyMigrationV11(db) {
  db.prepare(`
    UPDATE sos_config
    SET whatsapp_number = ?
    WHERE id = 1 AND whatsapp_number IN ('5531971720053', '553197170053')
  `).run(DOCTOR8_WABA_WHATSAPP_E164);
  setSchemaVersion(db, 11);
}

function applyMigrationV12(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'project',
      status TEXT NOT NULL DEFAULT 'draft',
      title_pt TEXT NOT NULL,
      title_es TEXT NOT NULL,
      summary_pt TEXT NOT NULL DEFAULT '',
      summary_es TEXT NOT NULL DEFAULT '',
      body_pt TEXT NOT NULL DEFAULT '',
      body_es TEXT NOT NULL DEFAULT '',
      cover_url TEXT NOT NULL DEFAULT '',
      video_url TEXT NOT NULL DEFAULT '',
      gallery_json TEXT NOT NULL DEFAULT '[]',
      goal_amount REAL NOT NULL DEFAULT 0,
      raised_amount REAL NOT NULL DEFAULT 0,
      donor_count INTEGER NOT NULL DEFAULT 0,
      show_thermometer INTEGER NOT NULL DEFAULT 1,
      accepts_donation INTEGER NOT NULL DEFAULT 1,
      allow_once INTEGER NOT NULL DEFAULT 1,
      allow_monthly INTEGER NOT NULL DEFAULT 1,
      min_amount REAL NOT NULL DEFAULT 5,
      max_amount REAL NOT NULL DEFAULT 50000,
      suggested_amounts_json TEXT NOT NULL DEFAULT '[30,50,100,250,500,1000]',
      destination TEXT NOT NULL DEFAULT 'humanitaria',
      impact_text_pt TEXT NOT NULL DEFAULT '',
      impact_text_es TEXT NOT NULL DEFAULT '',
      matching_text_pt TEXT NOT NULL DEFAULT '',
      matching_text_es TEXT NOT NULL DEFAULT '',
      matching_cap REAL NOT NULL DEFAULT 0,
      enable_pix INTEGER NOT NULL DEFAULT 1,
      enable_paypal INTEGER NOT NULL DEFAULT 1,
      enable_paypal_monthly INTEGER NOT NULL DEFAULT 1,
      show_donor_wall INTEGER NOT NULL DEFAULT 1,
      show_donor_amounts INTEGER NOT NULL DEFAULT 0,
      ends_at TEXT,
      publish_at TEXT,
      featured INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      secondary_cta_label_pt TEXT NOT NULL DEFAULT '',
      secondary_cta_label_es TEXT NOT NULL DEFAULT '',
      secondary_cta_url TEXT NOT NULL DEFAULT '',
      seo_title_pt TEXT NOT NULL DEFAULT '',
      seo_title_es TEXT NOT NULL DEFAULT '',
      seo_description_pt TEXT NOT NULL DEFAULT '',
      seo_description_es TEXT NOT NULL DEFAULT '',
      utm_campaign TEXT NOT NULL DEFAULT '',
      internal_notes TEXT NOT NULL DEFAULT '',
      internal_owner TEXT NOT NULL DEFAULT '',
      cost_center TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaign_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      title_pt TEXT NOT NULL DEFAULT '',
      title_es TEXT NOT NULL DEFAULT '',
      body_pt TEXT NOT NULL DEFAULT '',
      body_es TEXT NOT NULL DEFAULT '',
      published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaign_faqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      question_pt TEXT NOT NULL DEFAULT '',
      question_es TEXT NOT NULL DEFAULT '',
      answer_pt TEXT NOT NULL DEFAULT '',
      answer_es TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS donations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'BRL',
      method TEXT NOT NULL DEFAULT 'pix',
      status TEXT NOT NULL DEFAULT 'reported',
      frequency TEXT NOT NULL DEFAULT 'once',
      provider_payment_id TEXT NOT NULL DEFAULT '',
      donor_name TEXT NOT NULL DEFAULT '',
      donor_email TEXT NOT NULL DEFAULT '',
      anonymous INTEGER NOT NULL DEFAULT 0,
      badge_id TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      confirmed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
    CREATE INDEX IF NOT EXISTS idx_campaigns_type ON campaigns(type);
    CREATE INDEX IF NOT EXISTS idx_campaign_updates_campaign ON campaign_updates(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_faqs_campaign ON campaign_faqs(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_donations_campaign ON donations(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);
  `);

  const { seedDefaultCampaigns } = require('./campaigns');
  seedDefaultCampaigns(db);
  console.log('Migration v12: campaigns, updates, faqs, donations');
  setSchemaVersion(db, 12);
}

function applyMigrationV13(db) {
  db.prepare(
    `UPDATE campaigns
     SET secondary_cta_label_pt = '',
         secondary_cta_label_es = '',
         secondary_cta_url = '',
         updated_at = datetime('now')
     WHERE slug = 'sos-venezuela'`
  ).run();
  console.log('Migration v13: remove volunteer CTA from sos-venezuela donate flow');
  setSchemaVersion(db, 13);
}

function applyMigrationV14(db) {
  db.prepare(
    `UPDATE campaigns
     SET enable_pix = 0,
         enable_paypal = 1,
         updated_at = datetime('now')`
  ).run();
  console.log('Migration v14: disable Pix on campaigns; PayPal only');
  setSchemaVersion(db, 14);
}

function applyMigrationV15(db) {
  db.prepare(
    `UPDATE campaigns
     SET body_pt = REPLACE(body_pt, 'via Pix ou PayPal', 'via PayPal'),
         body_es = REPLACE(body_es, 'vía Pix o PayPal', 'vía PayPal'),
         updated_at = datetime('now')
     WHERE body_pt LIKE '%Pix%' OR body_es LIKE '%Pix%'`
  ).run();
  console.log('Migration v15: remove Pix mentions from campaign bodies');
  setSchemaVersion(db, 15);
}

function applyMigrationV16(db) {
  const cols = db.prepare('PRAGMA table_info(campaigns)').all();
  if (!cols.some((c) => c.name === 'attachments_json')) {
    db.exec(`ALTER TABLE campaigns ADD COLUMN attachments_json TEXT NOT NULL DEFAULT '[]'`);
  }

  const exists = db
    .prepare(`SELECT id FROM campaigns WHERE slug = ?`)
    .get('impressos-sos-venezuela');
  if (!exists) {
    const attachments = JSON.stringify([
      {
        title_pt: 'Orçamento da gráfica (Presupuesto 0059)',
        title_es: 'Presupuesto de la imprenta (Nº 0059)',
        url: '/docs/orcamento-impressos-sos-venezuela-0059.pdf',
      },
      {
        title_pt: 'Modelo do impresso SOS Saúde Venezuela',
        title_es: 'Modelo del impreso SOS Salud Venezuela',
        url: '/docs/modelo-impresso-sos-saude-venezuela.pdf',
      },
    ]);

    db.prepare(
      `INSERT INTO campaigns (
        slug, type, status, title_pt, title_es, summary_pt, summary_es, body_pt, body_es,
        cover_url, goal_amount, raised_amount, donor_count, destination, featured, sort_order,
        impact_text_pt, impact_text_es, secondary_cta_label_pt, secondary_cta_label_es, secondary_cta_url,
        enable_pix, enable_paypal, enable_paypal_monthly, allow_once, allow_monthly,
        suggested_amounts_json, attachments_json, utm_campaign, internal_notes
      ) VALUES (
        @slug, @type, @status, @title_pt, @title_es, @summary_pt, @summary_es, @body_pt, @body_es,
        @cover_url, @goal_amount, 0, 0, @destination, 1, 0,
        @impact_text_pt, @impact_text_es, @secondary_cta_label_pt, @secondary_cta_label_es, @secondary_cta_url,
        0, 1, 1, 1, 1,
        @suggested_amounts_json, @attachments_json, @utm_campaign, @internal_notes
      )`
    ).run({
      slug: 'impressos-sos-venezuela',
      type: 'project',
      status: 'published',
      title_pt: 'Impressos SOS Saúde Venezuela',
      title_es: 'Impresos SOS Salud Venezuela',
      summary_pt:
        'Ajude a imprimir volantes e materiais de divulgação do SOS Saúde Venezuela em Caracas. Orçamento da gráfica: US$ 50,00 (meta R$ 300).',
      summary_es:
        'Ayuda a imprimir volantes y materiales de divulgación del SOS Salud Venezuela en Caracas. Presupuesto de la imprenta: US$ 50,00 (meta R$ 300).',
      body_pt: `Para divulgar o atendimento médico e psicológico gratuito às vítimas dos terremotos, a equipe na Venezuela orçou a impressão de materiais com a gráfica Impresos Nuevo Mundo (Caracas).

O que será impresso (Presupuesto Nº 000059 — 14/07/2026):
• 200 volantes 10×15 cm (papel bond)
• 200 volantes tamanho carta (glasse 150)
• 30 volantes tamanho doble carta (glasse 150)

Total do orçamento: US$ 50,00 (itens US$ 43,10 + impostos US$ 6,90).
A meta em reais (R$ 300) cobre esse valor com margem de câmbio e remessa.

Os PDFs do orçamento e do modelo do impresso estão disponíveis para download nesta página.
Se preferir doar via Pix diretamente, use também a página geral de doações da ACURABRASIL.`,
      body_es: `Para divulgar la atención médica y psicológica gratuita a las víctimas de los terremotos, el equipo en Venezuela cotizó la impresión de materiales con la imprenta Impresos Nuevo Mundo (Caracas).

Qué se imprimirá (Presupuesto Nº 000059 — 14/07/2026):
• 200 volantes 10×15 cm (papel bond)
• 200 volantes tamaño carta (glasse 150)
• 30 volantes tamaño doble carta (glasse 150)

Total del presupuesto: US$ 50,00 (ítems US$ 43,10 + impuestos US$ 6,90).
La meta en reales (R$ 300) cubre ese valor con margen de cambio y remesa.

Los PDF del presupuesto y del modelo del impreso están disponibles para descarga en esta página.
Si prefieres donar vía Pix directamente, usa también la página general de donaciones de ACURABRASIL.`,
      cover_url: '/img/projetos/grafica-impressos.jpg',
      goal_amount: 300,
      destination: 'humanitaria',
      impact_text_pt: 'Meta R$ 300 para cobrir o orçamento de US$ 50,00 da gráfica em Caracas.',
      impact_text_es: 'Meta R$ 300 para cubrir el presupuesto de US$ 50,00 de la imprenta en Caracas.',
      secondary_cta_label_pt: 'Doar via Pix (página de doações)',
      secondary_cta_label_es: 'Donar vía Pix (página de donaciones)',
      secondary_cta_url: '/doacao',
      suggested_amounts_json: JSON.stringify([30, 50, 100, 150, 300]),
      attachments_json: attachments,
      utm_campaign: 'impressos-sos-venezuela',
      internal_notes:
        'Orçamento Impresos Nuevo Mundo C.A. (J296277656), Caracas. Presupuesto 0059. Total US$ 50,00.',
    });
    console.log('Migration v16: campaign impressos-sos-venezuela created');
  } else {
    console.log('Migration v16: campaign impressos-sos-venezuela already exists');
  }

  setSchemaVersion(db, 16);
}

function applyMigrationV17(db) {
  const info = db
    .prepare(`UPDATE campaigns SET cover_url = ?, updated_at = datetime('now') WHERE slug = ?`)
    .run('/img/projetos/grafica-impressos.jpg', 'impressos-sos-venezuela');
  console.log(
    'Migration v17: impressos-sos-venezuela cover -> grafica-impressos.jpg (rows=' +
      info.changes +
      ')'
  );
  setSchemaVersion(db, 17);
}

function applyMigrationV18(db) {
  // PayPal aceita qualquer valor; o mínimo R$ 5 bloqueava testes/doações pequenas
  // e o front ainda mostrava "doação confirmada" sem gravar na barra.
  const mins = db.prepare(`UPDATE campaigns SET min_amount = 1 WHERE min_amount IS NULL OR min_amount > 1`).run();
  console.log('Migration v18: min_amount -> 1 (rows=' + mins.changes + ')');

  const impressos = db
    .prepare(`SELECT id, raised_amount FROM campaigns WHERE slug = ?`)
    .get('impressos-sos-venezuela');
  if (impressos && Number(impressos.raised_amount || 0) === 0) {
    const existing = db
      .prepare(
        `SELECT id FROM donations WHERE campaign_id = ? AND notes LIKE '%min_amount%' LIMIT 1`
      )
      .get(impressos.id);
    if (!existing) {
      db.prepare(
        `INSERT INTO donations (
          campaign_id, amount, currency, method, status, frequency,
          provider_payment_id, donor_name, anonymous, badge_id, notes, confirmed_at
        ) VALUES (?, 1, 'BRL', 'paypal', 'confirmed', 'once', '', '', 1, 'amigo',
          'PayPal R$ 1 teste — registrado após falha de min_amount (API rejeitava < R$ 5).',
          datetime('now'))`
      ).run(impressos.id);
      db.prepare(
        `UPDATE campaigns SET
          raised_amount = MAX(0, raised_amount + 1),
          donor_count = MAX(0, donor_count + 1),
          updated_at = datetime('now')
        WHERE id = ?`
      ).run(impressos.id);
      console.log('Migration v18: registered R$ 1 test donation on impressos-sos-venezuela');
    }
  }

  setSchemaVersion(db, 18);
}

function applyMigrationV19(db) {
  // Mantém só Impressos SOS Saúde Venezuela ativa no hub público de campanhas.
  const hidden = db
    .prepare(
      `UPDATE campaigns
       SET status = 'draft', featured = 0, updated_at = datetime('now')
       WHERE slug IN ('sos-venezuela', 'pesquisa-cientifica', 'fundo-institucional')
         AND status != 'draft'`
    )
    .run();
  const keep = db
    .prepare(
      `UPDATE campaigns
       SET status = 'published', featured = 1, sort_order = 0, updated_at = datetime('now')
       WHERE slug = 'impressos-sos-venezuela'`
    )
    .run();
  console.log(
    'Migration v19: only impressos-sos-venezuela published (hidden=' +
      hidden.changes +
      ', keep=' +
      keep.changes +
      ')'
  );
  setSchemaVersion(db, 19);
}

function applyMigrationV20(db) {
  // Remove meta da campanha Impressos: arrecadação aberta, valor livre.
  const info = db
    .prepare(
      `UPDATE campaigns SET
        goal_amount = 0,
        summary_pt = ?,
        summary_es = ?,
        body_pt = ?,
        body_es = ?,
        impact_text_pt = ?,
        impact_text_es = ?,
        updated_at = datetime('now')
      WHERE slug = 'impressos-sos-venezuela'`
    )
    .run(
      'Ajude a imprimir volantes e materiais de divulgação do SOS Saúde Venezuela em Caracas. Orçamento da gráfica: US$ 50,00.',
      'Ayuda a imprimir volantes y materiales de divulgación del SOS Salud Venezuela en Caracas. Presupuesto de la imprenta: US$ 50,00.',
      `Para divulgar o atendimento médico e psicológico gratuito às vítimas dos terremotos, a equipe na Venezuela orçou a impressão de materiais com a gráfica Impresos Nuevo Mundo (Caracas).

O que será impresso (Presupuesto Nº 000059 — 14/07/2026):
• 200 volantes 10×15 cm (papel bond)
• 200 volantes tamanho carta (glasse 150)
• 30 volantes tamanho doble carta (glasse 150)

Total do orçamento: US$ 50,00 (itens US$ 43,10 + impostos US$ 6,90).
Qualquer valor ajuda a cobrir a impressão, o câmbio e a remessa.

Os PDFs do orçamento e do modelo do impresso estão disponíveis para download nesta página.
Se preferir doar via Pix diretamente, use também a página geral de doações da ACURABRASIL.`,
      `Para divulgar la atención médica y psicológica gratuita a las víctimas de los terremotos, el equipo en Venezuela cotizó la impresión de materiales con la imprenta Impresos Nuevo Mundo (Caracas).

Qué se imprimirá (Presupuesto Nº 000059 — 14/07/2026):
• 200 volantes 10×15 cm (papel bond)
• 200 volantes tamaño carta (glasse 150)
• 30 volantes tamaño doble carta (glasse 150)

Total del presupuesto: US$ 50,00 (ítems US$ 43,10 + impuestos US$ 6,90).
Cualquier valor ayuda a cubrir la impresión, el cambio y la remesa.

Los PDF del presupuesto y del modelo del impreso están disponibles para descarga en esta página.
Si prefieres donar vía Pix directamente, usa también la página general de donaciones de ACURABRASIL.`,
      'Sua doação ajuda a cobrir o orçamento de US$ 50,00 da gráfica em Caracas.',
      'Tu donación ayuda a cubrir el presupuesto de US$ 50,00 de la imprenta en Caracas.'
    );
  console.log('Migration v20: impressos-sos-venezuela without goal (rows=' + info.changes + ')');
  setSchemaVersion(db, 20);
}

function applyMigrationV21(db) {
  const attachments = JSON.stringify([
    {
      title_pt: 'Modelo do impresso SOS Saúde Venezuela',
      title_es: 'Modelo del impreso SOS Salud Venezuela',
      url: '/docs/modelo-impresso-sos-saude-venezuela.pdf',
    },
  ]);

  const info = db
    .prepare(
      `UPDATE campaigns SET
        summary_pt = ?,
        summary_es = ?,
        body_pt = ?,
        body_es = ?,
        impact_text_pt = ?,
        impact_text_es = ?,
        attachments_json = ?,
        updated_at = datetime('now')
      WHERE slug = 'impressos-sos-venezuela'`
    )
    .run(
      'Ajude a imprimir volantes e materiais de divulgação do SOS Saúde Venezuela em Caracas.',
      'Ayuda a imprimir volantes y materiales de divulgación del SOS Salud Venezuela en Caracas.',
      `Para divulgar o atendimento médico e psicológico gratuito às vítimas dos terremotos, a equipe na Venezuela orçou a impressão de materiais com a gráfica Impresos Nuevo Mundo (Caracas).

O que será impresso (Presupuesto Nº 000059 — 14/07/2026):
• 200 volantes 10×15 cm (papel bond)
• 200 volantes tamanho carta (glasse 150)
• 30 volantes tamanho doble carta (glasse 150)

Qualquer valor ajuda a cobrir a impressão, o câmbio e a remessa.`,
      `Para divulgar la atención médica y psicológica gratuita a las víctimas de los terremotos, el equipo en Venezuela cotizó la impresión de materiales con la imprenta Impresos Nuevo Mundo (Caracas).

Qué se imprimirá (Presupuesto Nº 000059 — 14/07/2026):
• 200 volantes 10×15 cm (papel bond)
• 200 volantes tamaño carta (glasse 150)
• 30 volantes tamaño doble carta (glasse 150)

Cualquier valor ayuda a cubrir la impresión, el cambio y la remesa.`,
      'Sua doação ajuda a cobrir a impressão, o câmbio e a remessa.',
      'Tu donación ayuda a cubrir la impresión, el cambio y la remesa.',
      attachments
    );
  console.log(
    'Migration v21: impressos copy + remove orçamento download (rows=' + info.changes + ')'
  );
  setSchemaVersion(db, 21);
}

function applyMigrationV22(db) {
  const attachments = JSON.stringify([
    {
      title_pt: 'SOS Saúde Venezuela — como funciona o atendimento gratuito',
      title_es: 'SOS Salud Venezuela — cómo funciona la atención gratuita',
      url: '/sos-venezuela',
    },
    {
      title_pt: 'A Instituição — quem somos e o que fazemos',
      title_es: 'La Institución — quiénes somos y qué hacemos',
      url: '/instituicao',
    },
    {
      title_pt: 'Transparência — documentos públicos da OSCIP',
      title_es: 'Transparencia — documentos públicos de la OSCIP',
      url: '/transparencia',
    },
  ]);

  const info = db
    .prepare(
      `UPDATE campaigns SET
        title_pt = ?,
        title_es = ?,
        summary_pt = ?,
        summary_es = ?,
        body_pt = ?,
        body_es = ?,
        impact_text_pt = ?,
        impact_text_es = ?,
        attachments_json = ?,
        updated_at = datetime('now')
      WHERE slug = 'impressos-sos-venezuela'`
    )
    .run(
      'Apoie a equipe SOS Saúde Venezuela',
      'Apoye al equipo SOS Salud Venezuela',
      'Ajude a manter a equipe que organiza o atendimento médico e psicológico gratuito às pessoas afetadas na Venezuela. Qualquer valor fortalece a operação humanitária da ACURABRASIL.',
      'Ayuda a mantener al equipo que organiza la atención médica y psicológica gratuita a las personas afectadas en Venezuela. Cualquier valor fortalece la operación humanitaria de ACURABRASIL.',
      `A ACURABRASIL (Associação Brasil pela Cura) é uma OSCIP fundada em 2018, em Belo Horizonte. Unimos ciência, transparência e assistência humanitária — com atendimento gratuito por telemedicina, em parceria com a plataforma Doctor8.

Já atuamos em emergências reais:
• na pandemia de COVID-19, com telemedicina humanitária que alcançou cerca de 12.000 famílias;
• no SOS Saúde Rio Grande do Sul (enchentes de 2024), com 2.664 solicitações de consulta e mais de 6.000 pessoas beneficiadas;
• e agora no SOS Saúde Venezuela, em resposta aos terremotos de junho de 2026.

Nesta campanha, sua doação não é só para um item pontual: ela ajuda a sustentar a equipe que faz a operação acontecer — triagem, acolhimento, coordenação de voluntários, comunicação com as famílias e o cuidado diário para que as consultas gratuitas cheguem a quem precisa.

Qualquer valor ajuda. Doar é fortalecer quem está na linha de frente do cuidado.`,
      `ACURABRASIL (Asociación Brasil por la Cura) es una OSCIP fundada en 2018, en Belo Horizonte. Unimos ciencia, transparencia y asistencia humanitaria — con atención gratuita por telemedicina, en alianza con la plataforma Doctor8.

Ya actuamos en emergencias reales:
• en la pandemia de COVID-19, con telemedicina humanitaria que alcanzó cerca de 12.000 familias;
• en el SOS Salud Río Grande do Sul (inundaciones de 2024), con 2.664 solicitudes de consulta y más de 6.000 personas beneficiadas;
• y ahora en el SOS Salud Venezuela, en respuesta a los terremotos de junio de 2026.

En esta campaña, tu donación no es solo para un ítem puntual: ayuda a sostener al equipo que hace posible la operación — triaje, acogida, coordinación de voluntarios, comunicación con las familias y el cuidado diario para que las consultas gratuitas lleguen a quien las necesita.

Cualquier valor ayuda. Donar es fortalecer a quienes están en la primera línea del cuidado.`,
      'Sua doação apoia a equipe que mantém o atendimento humanitário na Venezuela.',
      'Tu donación apoya al equipo que mantiene la atención humanitaria en Venezuela.',
      attachments
    );
  console.log(
    'Migration v22: impressos -> apoie a equipe SOS Venezuela (rows=' + info.changes + ')'
  );
  setSchemaVersion(db, 22);
}

function applyMigrationV23(db) {
  const info = db
    .prepare(`UPDATE campaigns SET cover_url = ?, updated_at = datetime('now') WHERE slug = ?`)
    .run('/img/projetos/solidariedade-abraco.jpg', 'impressos-sos-venezuela');
  console.log(
    'Migration v23: campaign cover -> solidariedade-abraco.jpg (rows=' + info.changes + ')'
  );
  setSchemaVersion(db, 23);
}

function applyMigrationV24(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS masterclass_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_slug TEXT NOT NULL DEFAULT 'eft-avatar-2026',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      nome TEXT NOT NULL,
      email TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      relacao TEXT NOT NULL,
      mensagem TEXT NOT NULL DEFAULT '',
      privacidade INTEGER NOT NULL DEFAULT 1,
      marketing INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'nova',
      admin_notes TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_masterclass_reg_course_created
      ON masterclass_registrations(course_slug, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_masterclass_reg_status
      ON masterclass_registrations(status);
    CREATE INDEX IF NOT EXISTS idx_masterclass_reg_email
      ON masterclass_registrations(email);
  `);
  console.log('Migration v24: masterclass_registrations');
  setSchemaVersion(db, 24);
}

function applyMigrationV25(db) {
  db.exec(`
    ALTER TABLE masterclass_registrations ADD COLUMN profissao TEXT NOT NULL DEFAULT '';
    ALTER TABLE masterclass_registrations ADD COLUMN aluno_meire TEXT NOT NULL DEFAULT '';
    ALTER TABLE masterclass_registrations ADD COLUMN codigo_carteirinha TEXT NOT NULL DEFAULT '';
  `);
  console.log('Migration v25: masterclass campos profissao, aluno_meire, codigo_carteirinha');
  setSchemaVersion(db, 25);
}

function applyMigrationV26(db) {
  db.exec(`
    ALTER TABLE masterclass_registrations ADD COLUMN termo_confidencialidade INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE masterclass_registrations ADD COLUMN termo_imagem INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE masterclass_registrations ADD COLUMN termos_versao TEXT NOT NULL DEFAULT '';
    ALTER TABLE masterclass_registrations ADD COLUMN termos_aceitos_em TEXT NOT NULL DEFAULT '';
  `);
  console.log('Migration v26: masterclass termos confidencialidade e imagem');
  setSchemaVersion(db, 26);
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
    VALUES (1, '491749803699', ?, ?, 'America/Sao_Paulo', ?, ?, datetime('now'))
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

function closeDbForTests() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

module.exports = {
  getDb,
  getDbPath,
  closeDbForTests,
  getConfig,
  parseJsonArray,
  rowToVolunteer,
  rowToTemplate,
  rowToIntake,
  formatDateLocal,
  DEFAULT_WA_GENERAL,
  DEFAULT_WA_REGISTRO,
};
