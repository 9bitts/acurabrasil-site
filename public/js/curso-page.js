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
    if (!obj) return '';
    return lang() === 'pt' ? obj[ptKey] : obj[esKey] || obj[ptKey];
  }

  function esc(s) {
    var el = document.createElement('span');
    el.textContent = s == null ? '' : String(s);
    return el.innerHTML;
  }

  function slugFromPath() {
    var parts = location.pathname.replace(/\/+$/, '').split('/');
    return parts[parts.length - 1] || '';
  }

  function youtubeEmbed(url) {
    if (!url) return null;
    var m = String(url).match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
    );
    return m ? 'https://www.youtube.com/embed/' + m[1] + '?rel=0' : null;
  }

  function storageKey(slug) {
    return 'acura.course.enrollment.' + slug;
  }

  function saveLocal(slug, enrollment) {
    try {
      localStorage.setItem(
        storageKey(slug),
        JSON.stringify({
          id: enrollment.id,
          email: enrollment.student_email,
          name: enrollment.student_name,
        })
      );
    } catch (e) {}
  }

  function loadLocal(slug) {
    try {
      return JSON.parse(localStorage.getItem(storageKey(slug)) || 'null');
    } catch (e) {
      return null;
    }
  }

  var state = {
    slug: slugFromPath(),
    course: null,
    modules: [],
    enrollment: null,
    activeLessonId: null,
  };

  var els = {
    root: document.getElementById('curso-root'),
    title: document.getElementById('curso-title'),
    summary: document.getElementById('curso-summary'),
    stats: document.getElementById('curso-stats'),
    body: document.getElementById('curso-body'),
    curriculum: document.getElementById('curso-curriculum'),
    player: document.getElementById('curso-player'),
    sidebar: document.getElementById('curso-sidebar'),
    instructor: document.getElementById('curso-instructor'),
  };

  function setPlayer(lesson) {
    if (!els.player) return;
    if (!lesson || !lesson.video_url) {
      els.player.innerHTML =
        '<div class="curso-player-empty">' + esc(t('cursos.player.empty')) + '</div>';
      return;
    }
    var yt = youtubeEmbed(lesson.video_url);
    if (yt) {
      els.player.innerHTML =
        '<iframe src="' +
        esc(yt) +
        '" title="' +
        esc(pick(lesson, 'title_pt', 'title_es')) +
        '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>';
      return;
    }
    els.player.innerHTML =
      '<video controls playsinline src="' +
      esc(lesson.video_url) +
      '"></video>';
  }

  function findLesson(id) {
    for (var i = 0; i < state.modules.length; i++) {
      var lessons = state.modules[i].lessons || [];
      for (var j = 0; j < lessons.length; j++) {
        if (String(lessons[j].id) === String(id)) return lessons[j];
      }
    }
    return null;
  }

  function firstPlayableLesson() {
    var preview = null;
    for (var i = 0; i < state.modules.length; i++) {
      var lessons = state.modules[i].lessons || [];
      for (var j = 0; j < lessons.length; j++) {
        if (!preview && lessons[j].video_url) preview = lessons[j];
        if (lessons[j].is_preview && lessons[j].video_url) return lessons[j];
      }
    }
    return preview;
  }

  function renderCurriculum() {
    if (!els.curriculum) return;
    if (!state.modules.length) {
      els.curriculum.innerHTML = '<p>' + esc(t('cursos.curriculum.empty')) + '</p>';
      return;
    }
    els.curriculum.innerHTML = state.modules
      .map(function (mod, idx) {
        var lessons = (mod.lessons || [])
          .map(function (les) {
            var active = String(les.id) === String(state.activeLessonId) ? ' active' : '';
            var done = les.completed ? ' completed' : '';
            var locked = !state.enrollment && !les.is_preview;
            return (
              '<button type="button" class="curso-lesson' +
              active +
              done +
              '" data-lesson="' +
              esc(String(les.id)) +
              '"' +
              (locked ? ' data-locked="1"' : '') +
              '>' +
              '<span>' +
              (les.completed ? '✓ ' : locked ? '🔒 ' : '▶ ') +
              esc(pick(les, 'title_pt', 'title_es')) +
              '</span>' +
              (les.is_preview
                ? '<small>' + esc(t('cursos.preview')) + '</small>'
                : '') +
              '</button>'
            );
          })
          .join('');
        return (
          '<div class="curso-module">' +
          '<button type="button" class="curso-module-toggle">' +
          esc(t('cursos.module')) +
          ' ' +
          (idx + 1) +
          ': ' +
          esc(pick(mod, 'title_pt', 'title_es')) +
          '</button>' +
          lessons +
          '</div>'
        );
      })
      .join('');
  }

  function renderSidebar() {
    if (!els.sidebar || !state.course) return;
    var c = state.course;
    if (!state.enrollment) {
      els.sidebar.innerHTML =
        '<div class="curso-sidebar-card">' +
        '<span class="cursos-free-badge">' +
        esc(t('cursos.freeVolunteers')) +
        '</span>' +
        '<h2>' +
        esc(t('cursos.enroll.title')) +
        '</h2>' +
        '<p>' +
        esc(t('cursos.enroll.text')) +
        '</p>' +
        '<form class="curso-enroll-form" id="curso-enroll-form">' +
        '<input name="name" required autocomplete="name" placeholder="' +
        esc(t('cursos.enroll.name')) +
        '">' +
        '<input name="email" type="email" required autocomplete="email" placeholder="' +
        esc(t('cursos.enroll.email')) +
        '">' +
        '<button type="submit" class="btn btn-verde">' +
        esc(t('cursos.enroll.cta')) +
        '</button>' +
        '</form>' +
        '<p style="margin-top:0.75rem;font-size:0.8rem;color:#64748b">' +
        esc(t('cursos.enroll.note')) +
        '</p></div>';
      return;
    }

    var percent = state.enrollment.progress_percent || 0;
    var cert =
      percent >= 100 && state.enrollment.verify_code
        ? '<a class="btn btn-verde" href="/cursos/certificado/' +
          esc(state.enrollment.verify_code) +
          '">' +
          esc(t('cursos.certificate.view')) +
          '</a>'
        : '<p style="font-size:0.85rem;color:#64748b">' +
          esc(t('cursos.certificate.hint')) +
          '</p>';

    els.sidebar.innerHTML =
      '<div class="curso-sidebar-card">' +
      '<h2>' +
      esc(t('cursos.progress')) +
      '</h2>' +
      '<p>' +
      esc(state.enrollment.student_name) +
      '</p>' +
      '<div class="curso-progress-bar"><span style="width:' +
      esc(String(Math.min(100, percent))) +
      '%"></span></div>' +
      '<p><strong>' +
      esc(String(percent)) +
      '%</strong></p>' +
      cert +
      '</div>';
  }

  function renderHero() {
    var c = state.course;
    if (!c) return;
    if (els.title) els.title.textContent = pick(c, 'title_pt', 'title_es');
    if (els.summary) els.summary.textContent = pick(c, 'summary_pt', 'summary_es');
    if (els.instructor) {
      els.instructor.textContent = c.instructor_name
        ? t('cursos.instructor') + ': ' + c.instructor_name
        : '';
    }
    if (els.body) {
      var body = pick(c, 'body_pt', 'body_es');
      els.body.innerHTML = body
        ? '<div class="curso-about"><h2>' +
          esc(t('cursos.about')) +
          '</h2><p style="white-space:pre-wrap">' +
          esc(body) +
          '</p></div>'
        : '';
    }
    if (els.stats) {
      var parts = [];
      parts.push(esc(String(c.lesson_count || 0)) + ' ' + esc(t('cursos.lessons')));
      if (c.workload_hours != null) {
        parts.push(esc(String(c.workload_hours)) + 'h');
      }
      parts.push(esc(t('cursos.free')));
      els.stats.innerHTML = parts.map(function (p) {
        return '<span>' + p + '</span>';
      }).join('');
    }
    document.title = pick(c, 'title_pt', 'title_es') + ' - ACURABRASIL';
  }

  function selectLesson(lessonId, { markComplete } = {}) {
    var lesson = findLesson(lessonId);
    if (!lesson) return;
    if (!state.enrollment && !lesson.is_preview) {
      alert(t('cursos.enroll.required'));
      return;
    }
    state.activeLessonId = lesson.id;
    setPlayer(lesson);
    renderCurriculum();
    if (markComplete && state.enrollment) {
      fetch('/api/courses/enrollments/' + state.enrollment.id + '/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: lesson.id }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (!data || !data.ok) return;
          state.enrollment = data.enrollment;
          state.modules = data.modules || state.modules;
          renderCurriculum();
          renderSidebar();
        })
        .catch(function () {});
    }
  }

  function bind() {
    if (els.curriculum) {
      els.curriculum.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-lesson]');
        if (!btn) return;
        selectLesson(btn.getAttribute('data-lesson'), { markComplete: true });
      });
    }
    document.addEventListener('submit', function (e) {
      if (!e.target || e.target.id !== 'curso-enroll-form') return;
      e.preventDefault();
      var fd = new FormData(e.target);
      fetch('/api/courses/' + encodeURIComponent(state.slug) + '/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fd.get('name'),
          email: fd.get('email'),
        }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (!data || !data.ok) {
            alert(t('cursos.enroll.error'));
            return;
          }
          state.enrollment = data.enrollment;
          saveLocal(state.slug, data.enrollment);
          return fetch('/api/courses/enrollments/' + data.enrollment.id)
            .then(function (r) {
              return r.json();
            })
            .then(function (full) {
              if (full && full.ok) {
                state.enrollment = full.enrollment;
                state.modules = full.modules || state.modules;
              }
              renderSidebar();
              renderCurriculum();
              var first = firstPlayableLesson();
              if (first) selectLesson(first.id);
            });
        })
        .catch(function () {
          alert(t('cursos.enroll.error'));
        });
    });
  }

  function restoreEnrollment() {
    var local = loadLocal(state.slug);
    if (!local || !local.id) return Promise.resolve();
    return fetch('/api/courses/enrollments/' + local.id)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data && data.ok) {
          state.enrollment = data.enrollment;
          state.modules = data.modules || state.modules;
        }
      })
      .catch(function () {});
  }

  function load() {
    if (!els.root) return;
    els.root.setAttribute('aria-busy', 'true');
    fetch('/api/courses/' + encodeURIComponent(state.slug))
      .then(function (r) {
        if (!r.ok) throw new Error('not_found');
        return r.json();
      })
      .then(function (data) {
        state.course = data.course;
        state.modules = data.modules || data.course.modules || [];
        return restoreEnrollment();
      })
      .then(function () {
        renderHero();
        renderCurriculum();
        renderSidebar();
        var first = firstPlayableLesson();
        if (first) selectLesson(first.id);
        els.root.setAttribute('aria-busy', 'false');
      })
      .catch(function () {
        if (els.title) els.title.textContent = t('cursos.notFound');
        if (els.summary) els.summary.textContent = '';
        if (els.sidebar) {
          els.sidebar.innerHTML =
            '<div class="curso-sidebar-card"><a class="btn btn-verde" href="/cursos">' +
            esc(t('cursos.back')) +
            '</a></div>';
        }
      });
  }

  bind();
  load();
  // i18n.js dispatches on document (not window).
  document.addEventListener('acura:langchange', function () {
    renderHero();
    renderCurriculum();
    renderSidebar();
  });
})();
