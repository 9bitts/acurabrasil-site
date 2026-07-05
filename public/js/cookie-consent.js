(function () {
  'use strict';

  var STORAGE_KEY = 'acura.cookie.consent';

  function readConsent() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw === 'all' || raw === 'essential') return raw;
    } catch (e) { /* ignore */ }
    return null;
  }

  function writeConsent(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (e) { /* ignore */ }
  }

  function t(key) {
    if (window.AcuraI18n) {
      return window.AcuraI18n.t(window.AcuraI18n.getLang(), key);
    }
    return key;
  }

  function applyTexts(banner) {
    var text = banner.querySelector('[data-i18n="cookie.banner.text"]');
    var accept = banner.querySelector('[data-i18n="cookie.banner.accept"]');
    var essential = banner.querySelector('[data-i18n="cookie.banner.essential"]');
    if (text) text.textContent = t('cookie.banner.text');
    if (accept) accept.textContent = t('cookie.banner.accept');
    if (essential) essential.textContent = t('cookie.banner.essential');
  }

  function dispatchConsent(choice) {
    document.dispatchEvent(
      new CustomEvent('acura:cookie-consent', { detail: { choice: choice } })
    );
    if (window.AcuraAnalytics && typeof window.AcuraAnalytics.onConsent === 'function') {
      window.AcuraAnalytics.onConsent(choice);
    }
  }

  function showBanner() {
    if (document.getElementById('cookie-consent-banner')) return;

    var banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.className = 'cookie-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookies');
    banner.innerHTML =
      '<div class="cookie-consent-inner">' +
      '<p data-i18n="cookie.banner.text"></p>' +
      '<div class="cookie-consent-actions">' +
      '<button type="button" class="btn btn-verde btn-sm" id="cookie-accept-all" data-i18n="cookie.banner.accept"></button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="cookie-essential-only" data-i18n="cookie.banner.essential"></button>' +
      '<a href="/privacidade" class="cookie-consent-link" data-i18n="footer.privacy">Política de Privacidade</a>' +
      '</div></div>';

    document.body.appendChild(banner);
    applyTexts(banner);

    document.getElementById('cookie-accept-all').addEventListener('click', function () {
      writeConsent('all');
      banner.remove();
      dispatchConsent('all');
    });

    document.getElementById('cookie-essential-only').addEventListener('click', function () {
      writeConsent('essential');
      banner.remove();
      dispatchConsent('essential');
    });

    document.addEventListener('acura:langchange', function () {
      applyTexts(banner);
    });
  }

  function init() {
    var existing = readConsent();
    if (existing) {
      dispatchConsent(existing);
      return;
    }
    showBanner();
  }

  window.AcuraCookieConsent = { readConsent: readConsent, writeConsent: writeConsent };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
