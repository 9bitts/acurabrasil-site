const { getDb, parseJsonArray } = require('./db');
const { buildHubUtmLinks, getSiteBaseUrl, listAllCampaignLinks } = require('./utm-links');

const VALID_HUB_STATUSES = ['pendente', 'em_cadastro', 'publicado', 'rejeitado'];

function rowToHub(row) {
  if (!row) return null;
  return { ...row };
}

function rowToListingKit(row) {
  if (!row) return null;
  return {
    ...row,
    categorias_es: parseJsonArray(row.categorias_es),
    palavras_chave_es: parseJsonArray(row.palavras_chave_es),
  };
}

function getListingKit(db) {
  const row = db.prepare('SELECT * FROM sos_listing_kit WHERE id = 1').get();
  return rowToListingKit(row);
}

function getHubs(db) {
  return db.prepare('SELECT * FROM sos_hubs ORDER BY ordem ASC, id ASC').all().map(rowToHub);
}

function getHubsPublishedCount(db) {
  return db.prepare(`SELECT COUNT(*) AS c FROM sos_hubs WHERE status = 'publicado'`).get().c;
}

function attachUtmLinks(hubs, siteBase) {
  return hubs.map((hub) => ({
    ...hub,
    utmLinks: buildHubUtmLinks(siteBase, hub.slug),
  }));
}

function getHubsForAdmin(req) {
  const db = getDb();
  const siteBase = getSiteBaseUrl(req);
  const hubs = attachUtmLinks(getHubs(db), siteBase);
  const published = getHubsPublishedCount(db);
  return {
    hubs,
    published,
    total: hubs.length,
    campaignLinks: listAllCampaignLinks(siteBase, hubs),
    siteBase,
  };
}

module.exports = {
  VALID_HUB_STATUSES,
  rowToListingKit,
  getListingKit,
  getHubs,
  getHubsPublishedCount,
  getHubsForAdmin,
  attachUtmLinks,
};
