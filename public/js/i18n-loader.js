(function () {
  'use strict';

  var STORAGE_KEY = 'acura.lang';
  var DEFAULT_LANG = 'es';
  var ASSET_V = '39';
  var loadPromises = {};

  window.ACURA_I18N = window.ACURA_I18N || { es: null, pt: null };
  window.__ACURA_I18N_READY__ = false;

  function getLang() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'es' || stored === 'pt') return stored;
    } catch (e) { /* ignore */ }
    return DEFAULT_LANG;
  }

  function assignLang(lang) {
    if (lang === 'es' && window.ACURA_I18N_ES) {
      window.ACURA_I18N.es = window.ACURA_I18N_ES;
    }
    if (lang === 'pt' && window.ACURA_I18N_PT) {
      window.ACURA_I18N.pt = window.ACURA_I18N_PT;
    }
  }

  function loadLangScript(lang) {
    if (window.ACURA_I18N[lang]) {
      return Promise.resolve();
    }
    if (loadPromises[lang]) return loadPromises[lang];

    loadPromises[lang] = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      // Absolute path: relative "js/..." breaks on /campanhas/:slug → /campanhas/js/...
      script.src = '/js/i18n-' + lang + '.js?v=' + ASSET_V;
      script.async = true;
      script.onload = function () {
        assignLang(lang);
        resolve();
      };
      script.onerror = function () {
        reject(new Error('Failed to load i18n-' + lang));
      };
      document.head.appendChild(script);
    });

    return loadPromises[lang];
  }

  function bootstrap() {
    var lang = getLang();
    return loadLangScript(lang).catch(function () {
      if (lang !== DEFAULT_LANG) return loadLangScript(DEFAULT_LANG);
    }).then(function () {
      window.__ACURA_I18N_READY__ = true;
      document.dispatchEvent(new CustomEvent('acura:i18n-ready', { detail: { lang: getLang() } }));
    });
  }

  window.AcuraI18nLoader = {
    getLang: getLang,
    loadLang: loadLangScript,
    bootstrap: bootstrap,
  };

  bootstrap();
})();
