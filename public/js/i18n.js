(function () {
  const STORAGE_KEY = 'acura.lang';
  const DEFAULT_LANG = 'es';

  function getLang() {
    if (window.AcuraI18nLoader?.getLang) {
      return window.AcuraI18nLoader.getLang();
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'es' || stored === 'pt') return stored;
    } catch { /* ignore */ }
    return DEFAULT_LANG;
  }

  const BRAND_WITH_SPACE_RE = /\bACURA\s+BRASIL\b/gi;
  const BRAND_TITLE_CASE_RE = /\bAcura\s+Brasil\b/g;

  function normalizeBrandText(text) {
    if (!text || typeof text !== 'string') return text;
    return text
      .replace(BRAND_WITH_SPACE_RE, 'ACURABRASIL')
      .replace(BRAND_TITLE_CASE_RE, 'ACURABRASIL');
  }

  function t(lang, key) {
    const dict = window.ACURA_I18N;
    if (!dict) return key;
    const value = dict[lang]?.[key] ?? dict.es?.[key] ?? dict.pt?.[key] ?? key;
    return normalizeBrandText(value);
  }

  function apply(lang) {
    if (!window.ACURA_I18N?.[lang] && !window.ACURA_I18N?.es) return;

    document.documentElement.lang = lang === 'es' ? 'es-VE' : 'pt-BR';

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const value = t(lang, key);
      if (el.hasAttribute('data-i18n-html')) {
        el.innerHTML = value;
      } else {
        el.textContent = value;
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(lang, el.getAttribute('data-i18n-placeholder'));
    });

    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(lang, el.getAttribute('data-i18n-aria')));
    });

    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(lang, el.getAttribute('data-i18n-title'));
    });

    const pageTitleKey = document.body.getAttribute('data-i18n-title');
    if (pageTitleKey) {
      document.title = t(lang, pageTitleKey);
    }

    const metaDesc = document.querySelector('meta[name="description"][data-i18n-content]');
    if (metaDesc) {
      metaDesc.setAttribute('content', t(lang, metaDesc.getAttribute('data-i18n-content')));
    }

    const logo = document.querySelector('.logo-img');
    if (logo) {
      logo.alt = t(lang, 'common.logoAlt');
    }

    applyOptionLabels(lang);

    const toggle = document.getElementById('lang-toggle');
    if (toggle) {
      const label = toggle.querySelector('.lang-toggle-label');
      const flag = toggle.querySelector('.lang-toggle-flag');
      if (lang === 'es') {
        if (label) label.textContent = 'PT';
        if (flag) flag.textContent = '🇧🇷';
        toggle.setAttribute('data-i18n-title', 'common.langSwitchPt');
        toggle.title = t(lang, 'common.langSwitchPt');
      } else {
        if (label) label.textContent = 'ES';
        if (flag) flag.textContent = '🇻🇪';
        toggle.setAttribute('data-i18n-title', 'common.langSwitchEs');
        toggle.title = t(lang, 'common.langSwitchEs');
      }
    }

    document.dispatchEvent(new CustomEvent('acura:langchange', { detail: { lang } }));
  }

  function applyOptionLabels(lang) {
    document.querySelectorAll('select option[data-i18n]').forEach((option) => {
      const key = option.getAttribute('data-i18n');
      const value = t(lang, key);
      option.textContent = value;
    });
  }

  async function setLang(lang) {
    if (lang !== 'es' && lang !== 'pt') return;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch { /* ignore */ }
    if (window.AcuraI18nLoader) {
      await window.AcuraI18nLoader.loadLang(lang);
    }
    apply(lang);
  }

  function bindToggle() {
    const toggle = document.getElementById('lang-toggle');
    if (!toggle || toggle.dataset.i18nBound) return;
    toggle.dataset.i18nBound = '1';
    toggle.addEventListener('click', () => {
      setLang(getLang() === 'es' ? 'pt' : 'es');
    });
  }

  function init() {
    apply(getLang());
    bindToggle();
  }

  function dictReady(lang) {
    return !!(window.ACURA_I18N?.[lang] || window.ACURA_I18N?.es || window.ACURA_I18N?.pt);
  }

  function start() {
    bindToggle();
    const lang = getLang();
    const run = () => apply(lang);

    if (window.AcuraI18nLoader) {
      if (dictReady(lang)) {
        run();
      } else {
        document.addEventListener('acura:i18n-ready', run, { once: true });
      }
      return;
    }

    run();
  }

  window.AcuraI18n = { getLang, setLang, apply, t, init: start };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
