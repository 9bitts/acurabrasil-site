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

  function esc(s) {
    var el = document.createElement('span');
    el.textContent = s == null ? '' : String(s);
    return el.innerHTML;
  }

  function categoryLabel(cat) {
    var map = {
      geral: 'cursos.cat.geral',
      saude: 'cursos.cat.saude',
      emergencia: 'cursos.cat.emergencia',
      psicologia: 'cursos.cat.psicologia',
      voluntariado: 'cursos.cat.voluntariado',
      gestao: 'cursos.cat.gestao',
      integrativa: 'cursos.cat.integrativa',
    };
    return t(map[cat] || 'cursos.cat.geral');
  }

  function cardHtml(c) {
    var title = pick(c, 'title_pt', 'title_es');
    var summary = pick(c, 'summary_pt', 'summary_es');
    var cover = c.cover_url
      ? '<img class="curso-card-cover" src="' + esc(c.cover_url) + '" alt="" loading="lazy">'
      : '<div class="curso-card-cover-fallback" aria-hidden="true">▶</div>';
    var hours =
      c.workload_hours != null
        ? esc(String(c.workload_hours)) + 'h'
        : esc(String(c.lesson_count || 0)) + ' ' + esc(t('cursos.lessons'));
    return (
      '<a class="curso-card" href="/cursos/' +
      esc(c.slug) +
      '">' +
      cover +
      '<div class="curso-card-body">' +
      '<span class="curso-card-badge">' +
      esc(categoryLabel(c.category)) +
      '</span>' +
      '<h2>' +
      esc(title) +
      '</h2>' +
      (summary ? '<p class="curso-card-summary">' + esc(summary) + '</p>' : '') +
      (c.instructor_name
        ? '<p class="curso-card-summary">' + esc(c.instructor_name) + '</p>'
        : '') +
      '<div class="curso-card-meta"><span>' +
      hours +
      '</span><span class="curso-card-price">' +
      esc(t('cursos.free')) +
      '</span></div>' +
      '</div></a>'
    );
  }

  var state = { q: '', category: '', courses: [] };
  var grid = document.getElementById('cursos-grid');
  var search = document.getElementById('cursos-q');
  var filters = document.getElementById('cursos-filters');

  function render() {
    if (!grid) return;
    if (!state.courses.length) {
      grid.innerHTML =
        '<div class="cursos-empty"><h3>' +
        esc(t('cursos.empty.title')) +
        '</h3><p>' +
        esc(t('cursos.empty.text')) +
        '</p></div>';
      return;
    }
    grid.innerHTML = state.courses.map(cardHtml).join('');
  }

  function load() {
    if (!grid) return;
    grid.innerHTML = '<p class="cursos-loading">' + esc(t('cursos.loading')) + '</p>';
    var params = new URLSearchParams();
    if (state.category) params.set('category', state.category);
    if (state.q.trim()) params.set('q', state.q.trim());
    fetch('/api/courses?' + params.toString())
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        state.courses = (data && data.courses) || [];
        render();
      })
      .catch(function () {
        grid.innerHTML =
          '<p class="cursos-error">' + esc(t('cursos.error')) + '</p>';
      });
  }

  if (filters) {
    filters.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-filter]');
      if (!btn) return;
      state.category = btn.getAttribute('data-filter') || '';
      filters.querySelectorAll('.cursos-filter').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      load();
    });
  }

  if (search) {
    var timer;
    search.addEventListener('input', function () {
      state.q = search.value || '';
      clearTimeout(timer);
      timer = setTimeout(load, 250);
    });
  }

  load();
  // i18n.js dispatches on document (not window) — must listen here to re-translate empty/cards.
  document.addEventListener('acura:langchange', render);
  document.addEventListener('acura:i18n-ready', render, { once: true });
})();
