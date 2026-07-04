const { getDb } = require('./db');

function getEmailTemplates(db) {
  return db.prepare('SELECT * FROM sos_email_templates WHERE id = 1').get();
}

function renderTemplateForPartner(templates, key, linkSolicitud) {
  const row = templates || getEmailTemplates(getDb());
  if (!row) return '';
  const map = {
    ong: row.template_parceria_ong_pt,
    igreja: row.template_igreja_pt,
    associacao: row.template_associacao_pt,
  };
  const tpl = map[key] || map.ong;
  return String(tpl).replace(/\{link_solicitud\}/g, linkSolicitud || '');
}

module.exports = {
  getEmailTemplates,
  renderTemplateForPartner,
};
