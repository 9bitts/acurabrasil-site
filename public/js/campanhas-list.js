(function () {
  'use strict';

  function t(key) {
    var current = lang();
    var fromApi =
      window.AcuraI18n && typeof window.AcuraI18n.t === 'function'
        ? window.AcuraI18n.t(current, key)
        : null;
    if (fromApi && fromApi !== key) return fromApi;

    var bundled =
      (current === 'pt' ? window.ACURA_I18N_PT : window.ACURA_I18N_ES) ||
      window.ACURA_I18N_ES ||
      window.ACURA_I18N_PT;
    if (bundled && bundled[key]) return bundled[key];

    var mapped =
      window.ACURA_I18N &&
      (window.ACURA_I18N[current] || window.ACURA_I18N.es || window.ACURA_I18N.pt);
    if (mapped && mapped[key]) return mapped[key];

    return key;
  }

  function lang() {
    if (window.AcuraI18n && typeof window.AcuraI18n.getLang === 'function') {
      return window.AcuraI18n.getLang();
    }
    if (window.AcuraI18nLoader && typeof window.AcuraI18nLoader.getLang === 'function') {
      return window.AcuraI18nLoader.getLang();
    }
    try {
      return localStorage.getItem('acura.lang') || 'es';
    } catch (e) {
      return 'es';
    }
  }

  function pick(obj, ptKey, esKey) {
    return lang() === 'pt' ? obj[ptKey] : obj[esKey] || obj[ptKey];
  }

  function money(n) {
    return Number(n || 0).toLocaleString(lang() === 'pt' ? 'pt-BR' : 'es-VE', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  function esc(s) {
    var el = document.createElement('span');
    el.textContent = s == null ? '' : String(s);
    return el.innerHTML;
  }

  function typeLabel(type) {
    var map = {
      emergency: 'campanhas.type.emergency',
      project: 'campanhas.type.project',
      research: 'campanhas.type.research',
      evergreen: 'campanhas.type.evergreen',
      matching: 'campanhas.type.matching',
      in_kind: 'campanhas.type.in_kind',
    };
    return t(map[type] || 'campanhas.type.project');
  }

  function thermoHtml(c) {
    if (!c.show_thermometer || !(c.goal_amount > 0)) {
      if (c.raised_amount > 0) {
        return (
          '<div class="campanha-thermo-meta"><span>' +
          esc(money(c.raised_amount)) +
          '</span><span>' +
          esc(String(c.donor_count || 0)) +
          ' ' +
          esc(t('campanhas.donors')) +
          '</span></div>'
        );
      }
      return '';
    }
    var pct = Math.min(100, c.progress_pct != null ? c.progress_pct : 0);
    return (
      '<div class="campanha-thermo"><div class="campanha-thermo-bar"><div class="campanha-thermo-fill" style="width:' +
      pct +
      '%"></div></div>' +
      '<div class="campanha-thermo-meta"><span>' +
      esc(money(c.raised_amount)) +
      ' / ' +
      esc(money(c.goal_amount)) +
      '</span><span>' +
      pct +
      '%</span></div></div>'
    );
  }

  function cardHtml(c) {
    var title = pick(c, 'title_pt', 'title_es');
    var summary = pick(c, 'summary_pt', 'summary_es');
    var badgeClass = c.type === 'emergency' ? ' campanha-card-badge--emergency' : '';
    return (
      '<a class="campanha-card" href="/campanhas/' +
      encodeURIComponent(c.slug) +
      '">' +
      '<img class="campanha-card-cover" src="' +
      esc(c.cover_url) +
      '" alt="" loading="lazy" width="400" height="250">' +
      '<div class="campanha-card-body">' +
      '<span class="campanha-card-badge' +
      badgeClass +
      '">' +
      esc(typeLabel(c.type)) +
      '</span>' +
      '<h2>' +
      esc(title) +
      '</h2>' +
      '<p>' +
      esc(summary) +
      '</p>' +
      thermoHtml(c) +
      '<span class="btn btn-verde btn-sm" style="margin-top:0.75rem;align-self:flex-start">' +
      esc(t('campanhas.card.cta')) +
      '</span>' +
      '</div></a>'
    );
  }

  var allCampaigns = [];
  var filter = '';

  function render() {
    var grid = document.getElementById('campanhas-grid');
    var closedWrap = document.getElementById('campanhas-closed-wrap');
    var closedGrid = document.getElementById('campanhas-closed');
    if (!grid) return;

    var active = allCampaigns.filter(function (c) {
      if (c.status === 'closed') return false;
      if (filter && c.type !== filter) return false;
      return true;
    });
    var closed = allCampaigns.filter(function (c) {
      return c.status === 'closed' && (!filter || c.type === filter);
    });

    if (!active.length) {
      grid.innerHTML = '<p class="campanhas-empty">' + esc(t('campanhas.empty')) + '</p>';
    } else {
      grid.innerHTML = active.map(cardHtml).join('');
    }

    if (closed.length && closedWrap && closedGrid) {
      closedWrap.hidden = false;
      closedGrid.innerHTML = closed.map(cardHtml).join('');
    } else if (closedWrap) {
      closedWrap.hidden = true;
    }
  }

  function bindFilters() {
    document.querySelectorAll('.campanhas-filter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        filter = btn.dataset.filter || '';
        document.querySelectorAll('.campanhas-filter').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        render();
      });
    });
  }

  function load() {
    fetch('/api/campaigns?includeClosed=1')
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        allCampaigns = data.campaigns || [];
        render();
      })
      .catch(function () {
        var grid = document.getElementById('campanhas-grid');
        if (grid) grid.innerHTML = '<p class="campanhas-empty">' + esc(t('campanhas.error')) + '</p>';
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindFilters();
    load();
    document.addEventListener('acura:langchange', render);
  });
})();
