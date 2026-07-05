const { getDb } = require('./db');
const { buildPartnerUtmLinks, getSiteBaseUrl } = require('./utm-links');
const { getEmailTemplates, renderTemplateForPartner } = require('./email-templates');

const VALID_PARTNER_STATUSES = [
  'nao_contatado',
  'contato_enviado',
  'em_conversa',
  'parceria_ativa',
  'recusado',
  'sem_resposta',
];

const VALID_PARTNER_TIPOS = [
  'ong_internacional',
  'ong_nacional',
  'associacao',
  'igreja',
  'outro',
];

function templateKeyForTipo(tipo) {
  if (tipo === 'igreja') return 'igreja';
  if (tipo === 'associacao') return 'associacao';
  return 'ong';
}

function getPartnerships(db) {
  return db.prepare('SELECT * FROM sos_partnerships ORDER BY ordem ASC, id ASC').all();
}

function getPartnershipBySlug(db, slug) {
  return db.prepare('SELECT * FROM sos_partnerships WHERE slug = ?').get(slug);
}

function getPartnershipLog(db, partnershipId) {
  return db
    .prepare('SELECT * FROM sos_partnership_log WHERE partnership_id = ? ORDER BY created_at DESC')
    .all(partnershipId);
}

function buildMailto(email, body) {
  const subject = encodeURIComponent('Parceria SOS Salud Venezuela — ACURABRASIL');
  const text = encodeURIComponent(body);
  const to = email || '';
  return to ? `mailto:${to}?subject=${subject}&body=${text}` : `mailto:?subject=${subject}&body=${text}`;
}

function attachPartnerExtras(partner, req, templates) {
  const siteBase = getSiteBaseUrl(req);
  const utmLinks = buildPartnerUtmLinks(siteBase, partner.slug);
  const tplKey = templateKeyForTipo(partner.tipo);
  const emailBody = renderTemplateForPartner(templates, tplKey, utmLinks.solicitud);
  return {
    ...partner,
    utmLinks,
    emailTemplateKey: tplKey,
    emailPreview: emailBody,
    mailtoLink: buildMailto(partner.contato_email, emailBody),
  };
}

function getPartnershipsForAdmin(req) {
  const db = getDb();
  const templates = getEmailTemplates(db);
  const partnerships = getPartnerships(db).map((p) => attachPartnerExtras(p, req, templates));
  const emConversa = db
    .prepare(`SELECT COUNT(*) AS c FROM sos_partnerships WHERE status = 'em_conversa'`)
    .get().c;
  const ativas = db
    .prepare(`SELECT COUNT(*) AS c FROM sos_partnerships WHERE status = 'parceria_ativa'`)
    .get().c;
  return { partnerships, emConversa, ativas, total: partnerships.length, templates };
}

function getPartnershipDetail(req, slug) {
  const db = getDb();
  const partner = getPartnershipBySlug(db, slug);
  if (!partner) return null;
  const templates = getEmailTemplates(db);
  const log = getPartnershipLog(db, partner.id);
  return {
    ...attachPartnerExtras(partner, req, templates),
    log,
  };
}

module.exports = {
  VALID_PARTNER_STATUSES,
  VALID_PARTNER_TIPOS,
  templateKeyForTipo,
  getPartnerships,
  getPartnershipBySlug,
  getPartnershipsForAdmin,
  getPartnershipDetail,
  buildMailto,
};
