(function () {
  'use strict';

  var SITE = 'https://www.acurabrasil.org';
  var OG_IMAGE = SITE + '/img/og-cover.svg';

  function pageSlug() {
    var path = window.location.pathname.replace(/^\//, '');
    if (!path || path.endsWith('/')) path += 'index.html';
    return path.split('/').pop() || 'index.html';
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
    'index.html': { titleKey: 'index.meta.title', descKey: 'index.meta.description' },
    'instituicao.html': { titleKey: 'inst.meta.title', descKey: 'inst.meta.description' },
    'equipe.html': { titleKey: 'equipe.meta.title', descKey: 'equipe.meta.description' },
    'pesquisas.html': { titleKey: 'pesq.meta.title', descKey: 'pesq.meta.description' },
    'atendimento-pandemia.html': { titleKey: 'covid.meta.title', descKey: 'covid.meta.description' },
    'sos-saude-rs.html': { titleKey: 'sosrs.meta.title', descKey: 'sosrs.meta.description' },
    'sos-venezuela.html': { titleKey: 'sosve.meta.title', descKey: 'sosve.meta.description' },
    'consulta-venezuela.html': { titleKey: 'consulta.meta.title', descKey: 'consulta.meta.description' },
    'solicitud-sos-venezuela.html': { titleKey: 'sosve.intake.meta.title', descKey: 'sosve.intake.meta.description' },
    'doacao.html': { titleKey: 'doacao.meta.title', descKey: 'doacao.meta.description' },
    'transparencia.html': { titleKey: 'trans.meta.title', descKey: 'trans.meta.description' },
    'contato.html': { titleKey: 'contato.meta.title', descKey: 'contato.meta.description' },
    'associar.html': { titleKey: 'associar.meta.title', descKey: 'associar.meta.description' },
    'privacidade.html': { titleKey: 'privacy.meta.title', descKey: 'privacy.meta.description' },
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
    var slug = pageSlug();
    var cfg = PAGE_META[slug];
    if (!cfg) return;

    var lang = 'es';
    try {
      var stored = localStorage.getItem('acura.lang');
      if (stored === 'pt' || stored === 'es') lang = stored;
    } catch (e) { /* ignore */ }

    var meta = metaFromI18n(lang, cfg.titleKey, cfg.descKey);
    var canonical = SITE + '/' + (slug === 'index.html' ? '' : slug);
    var locale = lang === 'pt' ? 'pt_BR' : 'es_VE';

    upsertLink('canonical', canonical);
    upsertLink('alternate', canonical, { hreflang: 'es-VE' });
    upsertLink('alternate', canonical, { hreflang: 'pt-BR' });
    upsertLink('alternate', canonical, { hreflang: 'x-default' });

    upsertMeta('property', 'og:type', 'website');
    upsertMeta('property', 'og:site_name', 'ACURA BRASIL');
    upsertMeta('property', 'og:title', meta.title);
    upsertMeta('property', 'og:description', meta.description);
    upsertMeta('property', 'og:url', canonical);
    upsertMeta('property', 'og:image', OG_IMAGE);
    upsertMeta('property', 'og:image:width', '1200');
    upsertMeta('property', 'og:image:height', '630');
    upsertMeta('property', 'og:locale', locale);
    upsertMeta('property', 'og:locale:alternate', lang === 'pt' ? 'es_VE' : 'pt_BR');

    upsertMeta('name', 'twitter:card', 'summary_large_image');
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
