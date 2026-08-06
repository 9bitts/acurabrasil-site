/**
 * Admin Cursos — UI module (loaded before admin-app.js)
 * Exposes window.AcuraAdminCourses
 * All courses are free for volunteers.
 */
(function (global) {
  'use strict';

  const STATUS_LABELS = {
    draft: 'Rascunho',
    published: 'Publicado',
    archived: 'Arquivado',
  };

  const CATEGORY_LABELS = {
    geral: 'Geral',
    saude: 'Saúde',
    emergencia: 'Emergência',
    psicologia: 'Psicologia',
    voluntariado: 'Voluntariado',
    gestao: 'Gestão',
    integrativa: 'Integrativa',
  };

  function esc(s) {
    const el = document.createElement('span');
    el.textContent = s ?? '';
    return el.innerHTML;
  }

  function emptyCourse() {
    return {
      slug: '',
      status: 'draft',
      title_pt: '',
      title_es: '',
      summary_pt: '',
      summary_es: '',
      body_pt: '',
      body_es: '',
      cover_url: '/img/og-share.png',
      instructor_name: '',
      category: 'geral',
      workload_hours: 1,
      featured: false,
      sort_order: 0,
      seo_title_pt: '',
      seo_title_es: '',
      seo_description_pt: '',
      seo_description_es: '',
      modules: [
        {
          title_pt: 'Módulo 1',
          title_es: 'Módulo 1',
          lessons: [
            {
              title_pt: 'Aula 1',
              title_es: 'Aula 1',
              description_pt: '',
              description_es: '',
              video_url: '',
              duration_secs: '',
              is_preview: true,
            },
          ],
        },
      ],
    };
  }

  function field(id, label, value, opts = {}) {
    const type = opts.type || 'text';
    if (type === 'textarea') {
      return `<div class="admin-form-group"><label for="${id}">${esc(label)}</label>
        <textarea id="${id}" rows="${opts.rows || 4}">${esc(value || '')}</textarea></div>`;
    }
    if (type === 'select') {
      const options = (opts.options || [])
        .map(([v, l]) => `<option value="${esc(v)}" ${String(value) === String(v) ? 'selected' : ''}>${esc(l)}</option>`)
        .join('');
      return `<div class="admin-form-group"><label for="${id}">${esc(label)}</label>
        <select id="${id}">${options}</select></div>`;
    }
    if (type === 'checkbox') {
      return `<label class="admin-check"><input type="checkbox" id="${id}" ${value ? 'checked' : ''}> ${esc(label)}</label>`;
    }
    return `<div class="admin-form-group"><label for="${id}">${esc(label)}</label>
      <input type="${type}" id="${id}" value="${esc(value ?? '')}" ${opts.step ? `step="${opts.step}"` : ''} ${opts.min != null ? `min="${opts.min}"` : ''}></div>`;
  }

  function val(id) {
    const el = document.getElementById(id);
    if (!el) return '';
    if (el.type === 'checkbox') return el.checked;
    return el.value;
  }

  function curriculumToText(modules) {
    const lines = [];
    (modules || []).forEach((mod, mi) => {
      lines.push(`# ${mod.title_pt || mod.title_es || `Módulo ${mi + 1}`}`);
      if (mod.title_es && mod.title_es !== mod.title_pt) {
        lines.push(`#es ${mod.title_es}`);
      }
      (mod.lessons || []).forEach((les) => {
        const flags = [];
        if (les.is_preview) flags.push('preview');
        if (les.duration_secs) flags.push(`${les.duration_secs}s`);
        const meta = flags.length ? ` [${flags.join(',')}]` : '';
        lines.push(`- ${les.title_pt || les.title_es || 'Aula'}${meta}`);
        if (les.title_es && les.title_es !== les.title_pt) {
          lines.push(`  es: ${les.title_es}`);
        }
        if (les.video_url) lines.push(`  video: ${les.video_url}`);
        if (les.description_pt) lines.push(`  desc: ${les.description_pt}`);
        if (les.description_es && les.description_es !== les.description_pt) {
          lines.push(`  desc_es: ${les.description_es}`);
        }
      });
      lines.push('');
    });
    return lines.join('\n').trim();
  }

  function parseCurriculumText(text) {
    const modules = [];
    let current = null;
    let lesson = null;
    String(text || '')
      .split(/\n/)
      .map((l) => l.trimEnd())
      .forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (trimmed.startsWith('#es ')) {
          if (current) current.title_es = trimmed.slice(4).trim();
          return;
        }
        if (trimmed.startsWith('#')) {
          current = {
            title_pt: trimmed.replace(/^#\s*/, ''),
            title_es: trimmed.replace(/^#\s*/, ''),
            lessons: [],
          };
          modules.push(current);
          lesson = null;
          return;
        }
        if (trimmed.startsWith('- ')) {
          if (!current) {
            current = { title_pt: 'Módulo 1', title_es: 'Módulo 1', lessons: [] };
            modules.push(current);
          }
          let title = trimmed.slice(2).trim();
          let is_preview = false;
          let duration_secs = null;
          const m = title.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
          if (m) {
            title = m[1].trim();
            m[2].split(',').forEach((flag) => {
              const f = flag.trim();
              if (f === 'preview') is_preview = true;
              if (/^\d+s$/.test(f)) duration_secs = Number(f.replace('s', ''));
            });
          }
          lesson = {
            title_pt: title,
            title_es: title,
            description_pt: '',
            description_es: '',
            video_url: '',
            duration_secs,
            is_preview,
          };
          current.lessons.push(lesson);
          return;
        }
        if (!lesson) return;
        if (trimmed.startsWith('es:')) {
          lesson.title_es = trimmed.slice(3).trim();
        } else if (trimmed.startsWith('video:')) {
          lesson.video_url = trimmed.slice(6).trim();
        } else if (trimmed.startsWith('desc_es:')) {
          lesson.description_es = trimmed.slice(8).trim();
        } else if (trimmed.startsWith('desc:')) {
          lesson.description_pt = trimmed.slice(5).trim();
        }
      });
    return modules;
  }

  function collectForm() {
    const workloadRaw = val('co-hours');
    return {
      slug: val('co-slug'),
      status: val('co-status'),
      title_pt: val('co-title-pt'),
      title_es: val('co-title-es'),
      summary_pt: val('co-summary-pt'),
      summary_es: val('co-summary-es'),
      body_pt: val('co-body-pt'),
      body_es: val('co-body-es'),
      cover_url: val('co-cover'),
      instructor_name: val('co-instructor'),
      category: val('co-category'),
      workload_hours: workloadRaw === '' ? null : Number(workloadRaw),
      featured: val('co-featured'),
      sort_order: Number(val('co-sort') || 0),
      seo_title_pt: val('co-seo-title-pt'),
      seo_title_es: val('co-seo-title-es'),
      seo_description_pt: val('co-seo-desc-pt'),
      seo_description_es: val('co-seo-desc-es'),
      curriculum: parseCurriculumText(val('co-curriculum')),
    };
  }

  async function renderList(api, state) {
    const q = state.coursesQ || '';
    const status = state.coursesStatus || '';
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    const data = await api(`/api/admin/courses?${params}`);
    const courses = data.courses || [];
    const rows = courses
      .map(
        (c) => `<tr>
        <td><strong>${esc(c.title_pt || c.title_es)}</strong><br><small>/${esc(c.slug)}</small></td>
        <td>${esc(STATUS_LABELS[c.status] || c.status)}</td>
        <td>${esc(CATEGORY_LABELS[c.category] || c.category)}</td>
        <td>${esc(String(c.lesson_count || 0))}</td>
        <td>${esc(String(c.enrollment_count || 0))}</td>
        <td><span style="color:#72a842;font-weight:700">Grátis</span></td>
        <td><button type="button" class="admin-btn admin-btn-sm" data-edit-course="${c.id}">Editar</button></td>
      </tr>`
      )
      .join('');

    return `
      <div class="admin-header-row">
        <h1>Cursos</h1>
        <button type="button" class="admin-btn" id="course-new">Novo curso</button>
      </div>
      <p class="admin-muted">Todos os cursos são <strong>gratuitos</strong> para voluntários. Sem pagamento.</p>
      <div class="admin-card" style="margin-bottom:1rem">
        <div class="admin-grid-2">
          ${field('courses-q', 'Buscar', q)}
          ${field('courses-status', 'Status', status, {
            type: 'select',
            options: [['', 'Todos'], ...Object.entries(STATUS_LABELS)],
          })}
        </div>
        <button type="button" class="admin-btn admin-btn-secondary" id="courses-filter">Filtrar</button>
      </div>
      <div class="admin-card">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Curso</th><th>Status</th><th>Categoria</th><th>Aulas</th><th>Alunos</th><th>Preço</th><th></th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="7">Nenhum curso ainda.</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  async function renderEdit(api, state) {
    const isNew = !state.coursesEditId;
    let course = emptyCourse();
    let enrollments = [];
    if (!isNew) {
      const data = await api(`/api/admin/courses/${state.coursesEditId}`);
      course = { ...emptyCourse(), ...data.course };
      enrollments = data.enrollments || [];
    }

    const enrollRows = enrollments
      .slice(0, 100)
      .map(
        (e) => `<tr>
        <td>${esc(e.student_name)}</td>
        <td>${esc(e.student_email)}</td>
        <td>${esc(String(e.progress_percent || 0))}%</td>
        <td>${esc(String(e.enrolled_at || '').slice(0, 16))}</td>
        <td>${e.verify_code ? `<a href="/cursos/certificado/${esc(e.verify_code)}" target="_blank" rel="noopener">cert</a>` : '—'}</td>
      </tr>`
      )
      .join('');

    return `
      <div class="admin-header-row">
        <h1>${isNew ? 'Novo curso' : 'Editar curso'}</h1>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button type="button" class="admin-btn admin-btn-secondary" id="course-back">← Lista</button>
          ${!isNew ? `<button type="button" class="admin-btn admin-btn-danger" id="course-del">Excluir</button>` : ''}
          <button type="button" class="admin-btn" id="course-save">Salvar</button>
        </div>
      </div>
      <div class="admin-card" style="margin-bottom:1rem;background:#eef7e6;border-color:#d4e8c4">
        <strong>100% gratuito</strong> — este curso ficará disponível sem custo para todos os voluntários.
      </div>
      <div class="admin-card" style="margin-bottom:1rem">
        <h2>Identidade</h2>
        <div class="admin-grid-2">
          ${field('co-title-pt', 'Título PT *', course.title_pt)}
          ${field('co-title-es', 'Título ES *', course.title_es)}
          ${field('co-slug', 'Slug (URL)', course.slug)}
          ${field('co-status', 'Status', course.status, { type: 'select', options: Object.entries(STATUS_LABELS) })}
          ${field('co-category', 'Categoria', course.category, { type: 'select', options: Object.entries(CATEGORY_LABELS) })}
          ${field('co-instructor', 'Instrutor', course.instructor_name)}
          ${field('co-summary-pt', 'Resumo PT', course.summary_pt, { type: 'textarea', rows: 2 })}
          ${field('co-summary-es', 'Resumo ES', course.summary_es, { type: 'textarea', rows: 2 })}
          ${field('co-body-pt', 'Descrição PT', course.body_pt, { type: 'textarea', rows: 6 })}
          ${field('co-body-es', 'Descrição ES', course.body_es, { type: 'textarea', rows: 6 })}
          ${field('co-cover', 'URL da capa', course.cover_url)}
          ${field('co-hours', 'Carga horária (h)', course.workload_hours ?? '', { type: 'number', min: 0, step: '0.5' })}
          ${field('co-sort', 'Ordem', course.sort_order, { type: 'number' })}
          ${field('co-featured', 'Destaque na vitrine', course.featured, { type: 'checkbox' })}
        </div>
      </div>
      <div class="admin-card" style="margin-bottom:1rem">
        <h2>Currículo</h2>
        <p class="admin-muted">Formato: linha <code># Módulo</code>, aulas com <code>- Título [preview,300s]</code>, e linhas <code>video:</code> / <code>desc:</code>.</p>
        ${field('co-curriculum', 'Módulos e aulas', curriculumToText(course.modules), { type: 'textarea', rows: 16 })}
      </div>
      <div class="admin-card" style="margin-bottom:1rem">
        <h2>SEO</h2>
        <div class="admin-grid-2">
          ${field('co-seo-title-pt', 'SEO título PT', course.seo_title_pt)}
          ${field('co-seo-title-es', 'SEO título ES', course.seo_title_es)}
          ${field('co-seo-desc-pt', 'SEO descrição PT', course.seo_description_pt, { type: 'textarea', rows: 2 })}
          ${field('co-seo-desc-es', 'SEO descrição ES', course.seo_description_es, { type: 'textarea', rows: 2 })}
        </div>
      </div>
      ${
        !isNew
          ? `<div class="admin-card">
        <h2>Matrículas (${enrollments.length})</h2>
        <table class="admin-table">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Progresso</th><th>Desde</th><th>Certificado</th></tr></thead>
          <tbody>${enrollRows || '<tr><td colspan="5">Nenhuma matrícula.</td></tr>'}</tbody>
        </table>
      </div>`
          : ''
      }`;
  }

  async function render(api, state) {
    if (state.coursesEditId || state.coursesEditId === 0 || state.coursesCreating) {
      return renderEdit(api, state);
    }
    return renderList(api, state);
  }

  function bind(api, state, rerender) {
    const goList = () => {
      state.coursesEditId = null;
      state.coursesCreating = false;
      rerender();
    };

    document.getElementById('course-new')?.addEventListener('click', () => {
      state.coursesCreating = true;
      state.coursesEditId = null;
      rerender();
    });

    document.getElementById('courses-filter')?.addEventListener('click', () => {
      state.coursesQ = val('courses-q');
      state.coursesStatus = val('courses-status');
      rerender();
    });

    document.querySelectorAll('[data-edit-course]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.coursesEditId = Number(btn.getAttribute('data-edit-course'));
        state.coursesCreating = false;
        rerender();
      });
    });

    document.getElementById('course-back')?.addEventListener('click', goList);

    document.getElementById('course-save')?.addEventListener('click', async () => {
      const payload = collectForm();
      try {
        if (state.coursesEditId) {
          await api(`/api/admin/courses/${state.coursesEditId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
        } else {
          const created = await api('/api/admin/courses', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          state.coursesEditId = created.course.id;
          state.coursesCreating = false;
        }
        alert('Curso salvo.');
        rerender();
      } catch (err) {
        alert('Erro ao salvar: ' + (err.message || 'falha'));
      }
    });

    document.getElementById('course-del')?.addEventListener('click', async () => {
      if (!state.coursesEditId) return;
      if (!confirm('Excluir este curso permanentemente?')) return;
      try {
        await api(`/api/admin/courses/${state.coursesEditId}`, { method: 'DELETE' });
        goList();
      } catch (err) {
        alert('Erro ao excluir: ' + (err.message || 'falha'));
      }
    });
  }

  global.AcuraAdminCourses = { render, bind };
})(window);
