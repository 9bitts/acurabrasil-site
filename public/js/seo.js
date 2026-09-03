(function () {
  'use strict';

  var SITE = 'https://www.acurabrasil.org';
  var OG_IMAGE = SITE + '/img/og-share.png';

  function cleanPathname() {
    var path = window.location.pathname || '/';
    if (/\.html$/i.test(path)) path = path.replace(/\.html$/i, '');
    path = path.replace(/\/+$/, '') || '/';
    if (path === '/index') path = '/';
    return path;
  }

  function pageSlug() {
    var path = cleanPathname();
    if (path === '/') return 'index';
    return path.split('/').filter(Boolean).pop() || 'index';
  }

  function canonicalFromLocation() {
    var path = cleanPathname();
    return path === '/' ? SITE + '/' : SITE + path;
  }

  function metaFromI18n(lang, titleKey, descKey) {
    var dict = window.ACURA_I18N;
    if (!dict) return { title: document.title, description: '' };
    var d = dict[lang] || dict.es || {};
    return {
      title: d[titleKey] || document.title,
      description: d[descKey] || '',
    };
  }

  var PAGE_META = {
    'index': { titleKey: 'index.meta.title', descKey: 'index.meta.description' },
    'instituicao': { titleKey: 'inst.meta.title', descKey: 'inst.meta.description' },
    'equipe': { titleKey: 'equipe.meta.title', descKey: 'equipe.meta.description' },
    'pesquisas': { titleKey: 'pesq.meta.title', descKey: 'pesq.meta.description' },
    'atendimento-pandemia': { titleKey: 'covid.meta.title', descKey: 'covid.meta.description' },
    'sos-saude-rs': { titleKey: 'sosrs.meta.title', descKey: 'sosrs.meta.description' },
    'consulta-venezuela': { titleKey: 'consulta.meta.title', descKey: 'consulta.meta.description' },
    'atendimento-humanitario': { titleKey: 'consulta.meta.title', descKey: 'consulta.meta.description' },
    'solicitud-sos-venezuela': { titleKey: 'sosve.intake.meta.title', descKey: 'sosve.intake.meta.description' },
    'doacao': { titleKey: 'doacao.meta.title', descKey: 'doacao.meta.description' },
    'campanhas': { titleKey: 'campanhas.meta.title', descKey: 'campanhas.meta.description' },
    'transparencia': { titleKey: 'trans.meta.title', descKey: 'trans.meta.description' },
    'contato': { titleKey: 'contato.meta.title', descKey: 'contato.meta.description' },
    'associar': { titleKey: 'associar.meta.title', descKey: 'associar.meta.description' },
    'privacidade': { titleKey: 'privacy.meta.title', descKey: 'privacy.meta.description' },
    'voluntarios': { titleKey: 'vol.meta.title', descKey: 'vol.meta.description' },
    'anjos': { titleKey: 'anjo.meta.title', descKey: 'anjo.meta.description' },
  };

  function upsertMeta(attr, name, content) {
    if (!content) return;
    var sel = 'meta[' + attr + '="' + name + '"]';
    var el = document.querySelector(sel);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function upsertLink(rel, href, extra) {
    var selector = 'link[rel="' + rel + '"]';
    if (extra && extra.hreflang) selector += '[hreflang="' + extra.hreflang + '"]';
    var el = document.querySelector(selector);
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', rel);
      if (extra && extra.hreflang) el.setAttribute('hreflang', extra.hreflang);
      document.head.appendChild(el);
    }
    el.setAttribute('href', href);
  }

  function applySeo() {
    var path = cleanPathname();
    var slug = pageSlug();
    var isCampaignDetail = /^\/campanhas\/[^/]+$/.test(path);
    var cfg = isCampaignDetail ? null : PAGE_META[slug];
    var canonical = canonicalFromLocation();

    var lang = 'es';
    try {
      var stored = localStorage.getItem('acura.lang');
      if (stored === 'pt' || stored === 'es') lang = stored;
    } catch (e) { /* ignore */ }

    // Always declare a user-selected canonical for Google (static tag + JS keep in sync).
    upsertLink('canonical', canonical);
    upsertLink('alternate', canonical, { hreflang: 'es-VE' });
    upsertLink('alternate', canonical, { hreflang: 'pt-BR' });
    upsertLink('alternate', canonical, { hreflang: 'x-default' });
    upsertMeta('property', 'og:url', canonical);

    if (!cfg) return;

    var meta = metaFromI18n(lang, cfg.titleKey, cfg.descKey);
    var locale = lang === 'pt' ? 'pt_BR' : 'es_VE';

    upsertMeta('property', 'og:type', 'website');
    upsertMeta('property', 'og:site_name', 'ACURABRASIL');
    upsertMeta('property', 'og:title', meta.title);
    upsertMeta('property', 'og:description', meta.description);
    upsertMeta('property', 'og:image', OG_IMAGE);
    upsertMeta('property', 'og:image:width', '500');
    upsertMeta('property', 'og:image:height', '500');
    upsertMeta('property', 'og:image:alt', 'ACURABRASIL');
    upsertMeta('property', 'og:image:type', 'image/png');
    upsertMeta('property', 'og:locale', locale);
    upsertMeta('property', 'og:locale:alternate', lang === 'pt' ? 'es_VE' : 'pt_BR');

    upsertMeta('name', 'twitter:card', 'summary');
    upsertMeta('name', 'twitter:title', meta.title);
    upsertMeta('name', 'twitter:description', meta.description);
    upsertMeta('name', 'twitter:image', OG_IMAGE);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySeo);
  } else {
    applySeo();
  }

  document.addEventListener('acura:langchange', applySeo);
})();
