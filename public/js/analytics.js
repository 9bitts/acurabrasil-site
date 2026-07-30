(function () {
  'use strict';

  var gtagLoaded = false;
  var pendingEvents = [];

  function defaultConsent() {
    window.dataLayer = window.dataLayer || [];
    function gtag() {
      window.dataLayer.push(arguments);
    }
    window.gtag = gtag;
    gtag('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      wait_for_update: 500,
    });
  }

  function loadGtag(id) {
    if (!id || gtagLoaded) return;
    gtagLoaded = true;

    // SRI não se aplica: a URL do gtag inclui o measurement ID dinâmico (?id=...)
    // e o Google não publica hashes por propriedade.
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(script);

    window.gtag('js', new Date());
    window.gtag('config', id, { anonymize_ip: true, send_page_view: true });

    pendingEvents.forEach(function (ev) {
      window.gtag('event', ev.name, ev.params || {});
    });
    pendingEvents = [];
  }

  function setAnalyticsConsent(granted) {
    if (!window.gtag) return;
    window.gtag('consent', 'update', {
      analytics_storage: granted ? 'granted' : 'denied',
    });
    if (granted && window.ACURA_ANALYTICS && window.ACURA_ANALYTICS.ga4Id) {
      loadGtag(window.ACURA_ANALYTICS.ga4Id);
    }
  }

  function trackEvent(name, params) {
    if (window.gtag && gtagLoaded) {
      window.gtag('event', name, params || {});
      return;
    }
    pendingEvents.push({ name: name, params: params || {} });
  }

  function onConsent(choice) {
    setAnalyticsConsent(choice === 'all');
  }

  function bindAutoTrackers() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-acura-track], a, button');
      if (!el) return;

      var track = el.getAttribute('data-acura-track');
      if (!track) {
        var href = el.getAttribute('href') || '';
        if (href.indexOf('atendimento-humanitario') !== -1 || href.indexOf('consulta-venezuela') !== -1 || href.indexOf('solicitud-sos-venezuela') !== -1) {
          track = 'consulta_iniciada';
        } else if (href.indexOf('wa.me') !== -1) {
          track = 'whatsapp_clicado';
        } else if (href.indexOf('doctor8.org/register/professional/signup') !== -1) {
          track = 'voluntario_cta_clicado';
        } else if (el.classList && el.classList.contains('btn-consulta-principal')) {
          track = 'consulta_iniciada';
        }
      }

      if (track) {
        trackEvent(track, { link_url: el.getAttribute('href') || undefined });
      }
    });

    var copyPix = document.getElementById('copy-pix-key');
    if (copyPix) {
      copyPix.addEventListener('click', function () {
        trackEvent('doacao_pix_copiada');
      });
    }
    var copyPixMonthly = document.getElementById('copy-pix-key-monthly');
    if (copyPixMonthly) {
      copyPixMonthly.addEventListener('click', function () {
        trackEvent('doacao_pix_copiada');
      });
    }

    document.addEventListener('acura:analytics', function (ev) {
      if (ev.detail && ev.detail.event) {
        trackEvent(ev.detail.event, ev.detail.params || {});
      }
    });
  }

  function fetchConfig() {
    return fetch('/api/site-config')
      .then(function (res) {
        return res.ok ? res.json() : {};
      })
      .catch(function () {
        return {};
      })
      .then(function (cfg) {
        if (cfg.ga4MeasurementId) {
          window.ACURA_ANALYTICS.ga4Id = cfg.ga4MeasurementId;
        }
      });
  }

  function init() {
    defaultConsent();
    bindAutoTrackers();

    fetchConfig().then(function () {
      var choice = window.AcuraCookieConsent && window.AcuraCookieConsent.readConsent();
      if (choice) {
        onConsent(choice);
      }
    });

    document.addEventListener('acura:cookie-consent', function (ev) {
      onConsent(ev.detail && ev.detail.choice);
    });
  }

  window.AcuraAnalytics = {
    trackEvent: trackEvent,
    onConsent: onConsent,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
