const DESTINATIONS = {
  solicitud: 'https://app.doctor8.org/atendimentohumanitario',
  landing: '/sos-venezuela',
  consulta: '/atendimento-humanitario',
};

const DEFAULT_SITE_URL = 'https://www.acurabrasil.org';

function getSiteBaseUrl(req) {
  const env = process.env.SITE_URL;
  if (env) return env.replace(/\/$/, '');
  if (req) {
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    const host = req.get('x-forwarded-host') || req.get('host');
    if (host) return `${proto}://${host}`.replace(/\/$/, '');
  }
  return DEFAULT_SITE_URL;
}

function buildCampaignUrl(siteBase, destinationKey, params = {}) {
  const path = DESTINATIONS[destinationKey] || DESTINATIONS.solicitud;
  const base = (siteBase || DEFAULT_SITE_URL).replace(/\/$/, '');
  const url = /^https?:\/\//i.test(path) ? new URL(path) : new URL(path, `${base}/`);
  url.searchParams.set('utm_source', params.source || 'direct');
  url.searchParams.set('utm_medium', params.medium || 'hub');
  url.searchParams.set('utm_campaign', params.campaign || 'sos-venezuela');
  url.searchParams.set('utm_content', params.content || destinationKey);
  return url.toString();
}

function buildHubUtmLinks(siteBase, hubSlug) {
  const common = { source: hubSlug, medium: 'hub', campaign: 'sos-venezuela' };
  return {
    solicitud: buildCampaignUrl(siteBase, 'solicitud', { ...common, content: 'solicitud' }),
    landing: buildCampaignUrl(siteBase, 'landing', { ...common, content: 'landing' }),
    consulta: buildCampaignUrl(siteBase, 'consulta', { ...common, content: 'consulta' }),
  };
}

function buildPartnerUtmLinks(siteBase, partnerSlug, medium = 'email') {
  const common = { source: partnerSlug, medium, campaign: 'sos-venezuela' };
  return {
    solicitud: buildCampaignUrl(siteBase, 'solicitud', { ...common, content: 'solicitud' }),
    landing: buildCampaignUrl(siteBase, 'landing', { ...common, content: 'landing' }),
    consulta: buildCampaignUrl(siteBase, 'consulta', { ...common, content: 'consulta' }),
  };
}

function getCanonicalUrls(siteBase) {
  const base = (siteBase || DEFAULT_SITE_URL).replace(/\/$/, '');
  const solicitud = DESTINATIONS.solicitud;
  return {
    solicitud: /^https?:\/\//i.test(solicitud) ? solicitud : `${base}${solicitud}`,
    landing: `${base}${DESTINATIONS.landing}`,
    consulta: `${base}${DESTINATIONS.consulta}`,
  };
}

function listAllCampaignLinks(siteBase, hubs) {
  const links = [];
  for (const hub of hubs) {
    const utm = buildHubUtmLinks(siteBase, hub.slug);
    for (const [dest, url] of Object.entries(utm)) {
      links.push({
        hub: hub.slug,
        hubNome: hub.nome,
        destino: dest,
        url,
      });
    }
  }
  return links;
}

module.exports = {
  DESTINATIONS,
  getSiteBaseUrl,
  buildCampaignUrl,
  buildHubUtmLinks,
  buildPartnerUtmLinks,
  getCanonicalUrls,
  listAllCampaignLinks,
};
