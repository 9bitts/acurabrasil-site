(function () {
  'use strict';

  const STATUS_LABELS = {
    nova: 'Nova',
    em_triagem: 'Em triagem',
    orientado_doctor8: 'Orientado Doctor8',
    na_fila: 'Na fila',
    em_consulta: 'Em consulta',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
  };

  const PRIORIDAD_LABELS = {
    emergencia: 'Emergência',
    alta: 'Alta',
    regular: 'Regular',
  };

  const ROLE_LABELS = {
    triagem: 'Triagem',
    cadastro_wa: 'Cadastro WA',
    coordenador: 'Coordenador',
    backup: 'Backup',
  };

  const HUB_STATUS_LABELS = {
    pendente: 'Pendente',
    em_cadastro: 'Em cadastro',
    publicado: 'Publicado',
    rejeitado: 'Rejeitado',
  };

  let state = {
    tab: 'dashboard',
    volunteers: [],
    templates: [],
    scheduleWeekStart: startOfWeek(new Date()),
    selectedProtocolo: null,
  };

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
    if (res.status === 401) {
      window.location.href = '/admin/login.html';
      throw new Error('unauthorized');
    }
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    if (!res.ok) throw new Error(data?.error || 'request_failed');
    return data;
  }

  function startOfWeek(d) {
    const x = new Date(d);
    const day = x.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function weekDates(start) {
    return Array.from({ length: 7 }, (_, i) => formatDate(addDays(start, i)));
  }

  function dayLabel(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return `${names[d.getDay()]} ${dateStr.slice(8)}/${dateStr.slice(5, 7)}`;
  }

  function esc(s) {
    const el = document.createElement('span');
    el.textContent = s ?? '';
    return el.innerHTML;
  }

  function badgeStatus(s) {
    return `<span class="badge badge-${esc(s)}">${esc(STATUS_LABELS[s] || s)}</span>`;
  }

  function badgeHubStatus(s) {
    const cls = s === 'publicado' ? 'badge-em_consulta' : s === 'em_cadastro' ? 'badge-em_triagem' : s === 'rejeitado' ? 'badge-cancelado' : 'badge-nova';
    return `<span class="badge ${cls}">${esc(HUB_STATUS_LABELS[s] || s)}</span>`;
  }

  function badgePrioridad(p) {
    return `<span class="badge badge-${esc(p)}">${esc(PRIORIDAD_LABELS[p] || p)}</span>`;
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = 'Copiado!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      }
    } catch {
      alert('Não foi possível copiar. Selecione o texto manualmente.');
    }
  }

  function updateNavHubBadge(published, total) {
    const el = document.getElementById('nav-hub-badge');
    if (el) el.textContent = `${published || 0}/${total || 4} publicados`;
  }

  async function init() {
    try {
      const me = await api('/api/admin/me');
      document.getElementById('admin-user-label').textContent = me.username;
    } catch {
      return;
    }

    document.getElementById('admin-nav').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      state.tab = btn.dataset.tab;
      state.selectedProtocolo = null;
      document.querySelectorAll('.admin-nav button').forEach((b) => b.classList.toggle('active', b === btn));
      render();
    });

    document.getElementById('admin-logout').addEventListener('click', async () => {
      await api('/api/admin/logout', { method: 'POST' });
      window.location.href = '/admin/login.html';
    });

    await loadVolunteers();
    await loadTemplates();
    try {
      const hubData = await api('/api/admin/hubs');
      state.hubsPublished = hubData.published;
      state.hubsTotal = hubData.total;
      updateNavHubBadge(hubData.published, hubData.total);
    } catch { /* ignore */ }
    render();
  }

  async function loadVolunteers() {
    const data = await api('/api/admin/volunteers');
    state.allVolunteers = data.volunteers;
    state.volunteers = data.volunteers.filter((v) => v.ativo);
  }

  async function loadTemplates() {
    const data = await api('/api/admin/shift-templates');
    state.templates = data.templates;
  }

  async function render() {
    const main = document.getElementById('admin-main');
    main.innerHTML = '<p>Carregando…</p>';
    try {
      if (state.tab === 'dashboard') main.innerHTML = await renderDashboard();
      else if (state.tab === 'intakes') main.innerHTML = await renderIntakes();
      else if (state.tab === 'schedule') main.innerHTML = await renderSchedule();
      else if (state.tab === 'templates') main.innerHTML = await renderTemplates();
      else if (state.tab === 'volunteers') main.innerHTML = await renderVolunteers();
      else if (state.tab === 'config') main.innerHTML = await renderConfig();
      else if (state.tab === 'divulgacao') main.innerHTML = await renderDivulgacao();
      bindEvents();
    } catch (err) {
      main.innerHTML = `<p class="admin-error">Erro: ${esc(err.message)}</p>`;
    }
  }

  async function renderDashboard() {
    const d = await api('/api/admin/dashboard');
    const statusCards = Object.entries(d.byStatus || {})
      .map(([k, v]) => `<div class="admin-card"><div class="admin-card-value">${v}</div><div class="admin-card-label">${esc(STATUS_LABELS[k] || k)}</div></div>`)
      .join('');

    const turno = (d.turnoAgora || [])
      .map((t) => `<li><strong>${esc(t.nome)}</strong> — ${esc(t.volunteerDisplay)}</li>`)
      .join('') || '<li>Nenhum turno ativo no momento</li>';

    return `
      <h1>Dashboard</h1>
      <div class="admin-cards">
        <div class="admin-card"><div class="admin-card-value">${d.intakesToday || 0}</div><div class="admin-card-label">Solicitudes hoje</div></div>
        <div class="admin-card"><div class="admin-card-value">${d.byStatus?.nova || 0}</div><div class="admin-card-label">Novas</div></div>
        <div class="admin-card"><div class="admin-card-value">${d.byStatus?.em_triagem || 0}</div><div class="admin-card-label">Em triagem</div></div>
        <div class="admin-card"><div class="admin-card-value">${d.isOpen ? 'Aberto' : 'Fechado'}</div><div class="admin-card-label">Status agora</div></div>
        <div class="admin-card admin-card--link" data-goto="divulgacao"><div class="admin-card-value">${d.hubsPublished || 0}/${d.hubsTotal || 4}</div><div class="admin-card-label">Hubs publicados</div></div>
      </div>
      ${statusCards ? `<div class="admin-cards">${statusCards}</div>` : ''}
      <div class="admin-panel">
        <h2>Turno agora</h2>
        <ul>${turno}</ul>
        ${d.nextOpenAt && !d.isOpen ? `<p><small>Próxima abertura: ${esc(d.nextOpenAt)}</small></p>` : ''}
        <button type="button" class="admin-btn admin-btn-sm" data-goto="intakes">Ver fila de solicitudes →</button>
        <button type="button" class="admin-btn admin-btn-sm admin-btn-secondary" data-goto="divulgacao" style="margin-left:0.5rem">Divulgação / Hubs →</button>
      </div>`;
  }

  async function renderIntakes() {
    if (state.selectedProtocolo) return renderIntakeDetail(state.selectedProtocolo);

    const params = new URLSearchParams();
    const status = state.intakeFilterStatus || '';
    const prioridad = state.intakeFilterPrioridad || '';
    const q = state.intakeFilterQ || '';
    if (status) params.set('status', status);
    if (prioridad) params.set('prioridad', prioridad);
    if (q) params.set('q', q);

    const data = await api('/api/admin/intakes?' + params.toString());
    const rows = data.intakes
      .map(
        (i) => `<tr class="clickable" data-protocolo="${esc(i.protocolo)}">
          <td><code>${esc(i.protocolo)}</code></td>
          <td>${esc(i.created_at?.slice(0, 16))}</td>
          <td>${esc(i.nome)}</td>
          <td>${badgePrioridad(i.prioridad)}</td>
          <td>${badgeStatus(i.status)}</td>
          <td>${esc(i.assigned_volunteer_nome || '—')}</td>
        </tr>`
      )
      .join('');

    return `
      <h1>Solicitudes — Fila de triagem</h1>
      <div class="admin-filters">
        <select id="filter-status">
          <option value="">Todos os status</option>
          ${Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <select id="filter-prioridad">
          <option value="">Todas prioridades</option>
          ${Object.entries(PRIORIDAD_LABELS).map(([k, v]) => `<option value="${k}" ${prioridad === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <input type="search" id="filter-q" placeholder="Buscar protocolo/nome" value="${esc(q)}">
        <button type="button" class="admin-btn admin-btn-sm" id="filter-apply">Filtrar</button>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Protocolo</th><th>Data</th><th>Nome</th><th>Prioridade</th><th>Status</th><th>Responsável</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6">Nenhuma solicitud encontrada</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  async function renderIntakeDetail(protocolo) {
    const data = await api('/api/admin/intakes/' + encodeURIComponent(protocolo));
    const i = data.intake;
    const phone = i.phone || {};
    const waLink = phone.whatsapp || (phone.ddi ? `https://wa.me/${phone.ddi}${phone.ddd}${phone.telefone}` : '#');

    const volOptions = (state.allVolunteers || state.volunteers)
      .map((v) => `<option value="${v.id}" ${i.assigned_volunteer_id === v.id ? 'selected' : ''}>${esc(v.nome)}</option>`)
      .join('');

    const logRows = (data.log || [])
      .map((l) => `<tr><td>${esc(l.changed_at?.slice(0, 16))}</td><td>${esc(l.old_status || '—')} → ${esc(l.new_status)}</td><td>${esc(l.note)}</td><td>${esc(l.changed_by)}</td></tr>`)
      .join('');

    return `
      <h1>Solicitud ${esc(i.protocolo)}</h1>
      <button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" id="back-intakes">← Voltar</button>
      <div class="admin-detail-grid" style="margin-top:1rem">
        <div class="admin-detail-item"><label>Nome</label><span>${esc(i.nome)}</span></div>
        <div class="admin-detail-item"><label>E-mail</label><span>${esc(i.email)}</span></div>
        <div class="admin-detail-item"><label>WhatsApp</label><span><a href="${esc(waLink)}" target="_blank" rel="noopener">${esc(phone.display || '—')}</a></span></div>
        <div class="admin-detail-item"><label>Prioridade</label><span>${badgePrioridad(i.prioridad)}</span></div>
        <div class="admin-detail-item"><label>Status</label><span>${badgeStatus(i.status)}</span></div>
        <div class="admin-detail-item"><label>Paciente</label><span>${esc(i.nome_paciente)}</span></div>
        <div class="admin-detail-item"><label>Ubicación</label><span>${esc(i.ubicacion)}</span></div>
        <div class="admin-detail-item"><label>Tipo atención</label><span>${esc(i.tipo_atencion)}</span></div>
      </div>
      <div class="admin-panel">
        <h2>Síntomas</h2>
        <p style="white-space:pre-wrap">${esc(i.sintomas)}</p>
        ${i.observaciones ? `<h2>Observaciones</h2><p style="white-space:pre-wrap">${esc(i.observaciones)}</p>` : ''}
      </div>
      <div class="admin-panel">
        <h2>Triagem</h2>
        <div class="admin-form-group">
          <label>Responsável</label>
          <select id="intake-volunteer"><option value="">—</option>${volOptions}</select>
        </div>
        <div class="admin-form-group">
          <label>Notas de triagem</label>
          <textarea id="intake-notes">${esc(i.triagem_notes)}</textarea>
        </div>
        <label><input type="checkbox" id="intake-d8" ${i.doctor8_registered ? 'checked' : ''}> Registrado no Doctor8</label>
        <div class="admin-status-actions">
          ${['em_triagem', 'orientado_doctor8', 'na_fila', 'em_consulta', 'concluido', 'cancelado']
            .map((s) => `<button type="button" class="admin-btn admin-btn-sm" data-set-status="${s}">${esc(STATUS_LABELS[s])}</button>`)
            .join('')}
        </div>
        <button type="button" class="admin-btn" id="save-intake">Salvar</button>
      </div>
      ${logRows ? `<div class="admin-panel"><h2>Histórico</h2><table class="admin-table"><thead><tr><th>Data</th><th>Status</th><th>Nota</th><th>Por</th></tr></thead><tbody>${logRows}</tbody></table></div>` : ''}`;
  }

  async function renderSchedule() {
    const from = formatDate(state.scheduleWeekStart);
    const to = formatDate(addDays(state.scheduleWeekStart, 6));
    const data = await api(`/api/admin/schedule?from=${from}&to=${to}`);
    const dates = weekDates(state.scheduleWeekStart);
    const schedMap = {};
    for (const row of data.schedule) {
      schedMap[`${row.date}-${row.shift_template_id}`] = row;
    }

    const rows = state.templates
      .map((tpl) => {
        const cells = dates
          .map((date) => {
            const key = `${date}-${tpl.id}`;
            const existing = schedMap[key];
            const volId = existing?.volunteer_id || '';
            const compatible = (state.allVolunteers || state.volunteers).filter(
              (v) => v.roles.includes(tpl.role) || v.roles.includes('backup') || v.roles.includes('coordenador')
            );
            const opts = compatible
              .map((v) => `<option value="${v.id}" ${volId === v.id ? 'selected' : ''}>${esc(v.nome)}</option>`)
              .join('');
            return `<td><select data-sched-date="${date}" data-sched-tpl="${tpl.id}"><option value="">—</option>${opts}</select></td>`;
          })
          .join('');
        return `<tr><td>${esc(tpl.nome)}<br><small>${esc(tpl.start_time)}–${esc(tpl.end_time)}</small></td>${cells}</tr>`;
      })
      .join('');

    const headers = dates.map((d) => `<th>${dayLabel(d)}</th>`).join('');

    return `
      <h1>Escala semanal</h1>
      <div class="admin-toolbar">
        <button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" id="sched-prev">← Semana anterior</button>
        <button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" id="sched-next">Próxima semana →</button>
        <button type="button" class="admin-btn admin-btn-secondary admin-btn-sm" id="sched-dup">Duplicar semana anterior</button>
        <button type="button" class="admin-btn admin-btn-sm" id="sched-save">Salvar escala</button>
        <a class="admin-btn admin-btn-secondary admin-btn-sm" href="/api/admin/schedule/export.csv?from=${from}&to=${to}" id="sched-export">Exportar CSV</a>
      </div>
      <div class="admin-schedule-grid">
        <table class="admin-schedule-table">
          <thead><tr><th>Turno</th>${headers}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  async function renderTemplates() {
    const rows = state.templates
      .map(
        (t) => `<tr data-tpl-id="${t.id}">
          <td>${esc(t.slug)}</td>
          <td><input type="text" class="tpl-nome" value="${esc(t.nome)}"></td>
          <td><input type="time" class="tpl-start" value="${esc(t.start_time)}"></td>
          <td><input type="time" class="tpl-end" value="${esc(t.end_time)}"></td>
          <td>${esc(ROLE_LABELS[t.role] || t.role)}</td>
          <td><button type="button" class="admin-btn admin-btn-sm tpl-save">Salvar</button></td>
        </tr>`
      )
      .join('');

    return `
      <h1>Turnos (templates)</h1>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Slug</th><th>Nome</th><th>Início</th><th>Fim</th><th>Papel</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  async function renderVolunteers() {
    const data = await api('/api/admin/volunteers');
    const rows = data.volunteers
      .map(
        (v) => `<tr data-vol-id="${v.id}">
          <td>${esc(v.nome)}</td>
          <td>${esc(v.email)}</td>
          <td>${esc(v.whatsapp)}</td>
          <td>${v.roles.map((r) => esc(ROLE_LABELS[r] || r)).join(', ')}</td>
          <td>${v.ativo ? 'Ativo' : 'Inativo'}</td>
          <td><button type="button" class="admin-btn admin-btn-sm vol-edit">Editar</button></td>
        </tr>`
      )
      .join('');

    return `
      <h1>Voluntários / Anjos</h1>
      <button type="button" class="admin-btn admin-btn-sm" id="vol-new">+ Novo voluntário</button>
      <div class="admin-table-wrap" style="margin-top:1rem">
        <table class="admin-table">
          <thead><tr><th>Nome</th><th>E-mail</th><th>WhatsApp</th><th>Papéis</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div id="vol-form-panel" class="admin-panel admin-hidden" style="margin-top:1rem"></div>`;
  }

  function formatWaDisplay(number) {
    const d = String(number || '').replace(/\D/g, '');
    if (d.length >= 12 && d.startsWith('55')) {
      return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
    }
    return d ? `+${d}` : '—';
  }

  async function renderConfig() {
    const data = await api('/api/admin/config');
    const c = data.config;
    const preview = await fetch('/api/sos-venezuela/public-info').then((r) => r.json());
    const shiftRows = (preview.shiftsToday || [])
      .map(
        (s) =>
          `<tr><td>${esc(s.nome)}</td><td>${esc(s.start)}–${esc(s.end)}</td><td>${esc(s.volunteer || '—')}</td></tr>`
      )
      .join('');
    const plantao = (preview.currentShifts || [])
      .map((s) => `<li><strong>${esc(s.nome)}</strong> — ${esc(s.volunteerDisplay)}</li>`)
      .join('');

    return `
      <h1>Configurações SOS</h1>
      <div class="admin-panel">
        <h2>WhatsApp</h2>
        <p class="admin-hint">Número usado nos botões do site e links wa.me. Informe só dígitos (ex.: 5531971720053).</p>
        <div class="admin-form-group">
          <label>Número WhatsApp</label>
          <input type="text" id="cfg-wa" value="${esc(c.whatsapp_number)}" inputmode="numeric" placeholder="5531971720053">
          <small class="admin-hint">Exibido como: ${esc(formatWaDisplay(c.whatsapp_number))}</small>
        </div>
        <div class="admin-form-group">
          <label>Mensagem geral (espanhol — atención)</label>
          <textarea id="cfg-wa-general" rows="2" placeholder="Hola, necesito atención gratuita del SOS Venezuela">${esc(c.whatsapp_message_general)}</textarea>
          <small class="admin-hint">Texto que o paciente envia ao clicar em atención por WhatsApp.</small>
        </div>
        <div class="admin-form-group">
          <label>Mensagem registro (espanhol — ayuda Doctor8)</label>
          <textarea id="cfg-wa-reg" rows="2" placeholder="Hola, necesito ayuda para registrarme en el SOS Venezuela">${esc(c.whatsapp_message_registro)}</textarea>
          <small class="admin-hint">Texto para quem precisa de ajuda com o cadastro.</small>
        </div>
        <div class="admin-form-group">
          <label>Fuso horário</label>
          <input type="text" id="cfg-tz" value="${esc(c.timezone)}" placeholder="America/Sao_Paulo">
        </div>
        <div class="admin-form-group">
          <label>Mensagem fora de horário (ES — site público)</label>
          <textarea id="cfg-ooh-es" rows="4">${esc(c.out_of_hours_message_es)}</textarea>
        </div>
        <div class="admin-form-group">
          <label>Mensagem fora de horário (PT — referência admin)</label>
          <textarea id="cfg-ooh-pt" rows="4">${esc(c.out_of_hours_message_pt)}</textarea>
        </div>
        <button type="button" class="admin-btn" id="cfg-save">Salvar configurações</button>
      </div>
      <div class="admin-panel">
        <h2>Preview público</h2>
        <p class="admin-hint">Como aparece nas páginas SOS Venezuela para pacientes.</p>
        <div class="admin-preview-box">
          <p><span class="badge ${preview.isOpen ? 'badge-em_consulta' : 'badge-alta'}">${preview.isOpen ? 'Aberto agora' : 'Fechado agora'}</span></p>
          ${plantao ? `<div class="admin-preview-block"><strong>Plantão agora</strong><ul>${plantao}</ul></div>` : ''}
          ${shiftRows ? `<div class="admin-preview-block"><strong>Turnos hoje</strong><table class="admin-table admin-table-compact"><thead><tr><th>Turno</th><th>Horário</th><th>Voluntário</th></tr></thead><tbody>${shiftRows}</tbody></table></div>` : ''}
          <div class="admin-preview-block">
            <strong>WhatsApp</strong>
            <p>${esc(formatWaDisplay(preview.whatsapp?.number))} <code>${esc(preview.whatsapp?.number)}</code></p>
            <p><a href="${esc(preview.whatsapp?.linkGeneral)}" target="_blank" rel="noopener">Testar link — atención</a></p>
            <p><a href="${esc(preview.whatsapp?.linkRegistro)}" target="_blank" rel="noopener">Testar link — registro</a></p>
          </div>
          <div class="admin-preview-block">
            <strong>Fora de horário (ES)</strong>
            <p class="admin-preview-message">${esc(preview.outOfHoursMessage?.es || '')}</p>
          </div>
        </div>
      </div>`;
  }

  function bindEvents() {
    document.querySelector('[data-goto="intakes"]')?.addEventListener('click', () => {
      state.tab = 'intakes';
      document.querySelector('[data-tab="intakes"]')?.classList.add('active');
      document.querySelector('[data-tab="dashboard"]')?.classList.remove('active');
      render();
    });

    document.querySelectorAll('[data-goto="divulgacao"]').forEach((el) => {
      el.addEventListener('click', () => {
        state.tab = 'divulgacao';
        document.querySelectorAll('.admin-nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'divulgacao'));
        render();
      });
    });

    document.getElementById('filter-apply')?.addEventListener('click', () => {
      state.intakeFilterStatus = document.getElementById('filter-status')?.value || '';
      state.intakeFilterPrioridad = document.getElementById('filter-prioridad')?.value || '';
      state.intakeFilterQ = document.getElementById('filter-q')?.value || '';
      render();
    });

    document.querySelectorAll('[data-protocolo]').forEach((tr) => {
      tr.addEventListener('click', () => {
        state.selectedProtocolo = tr.dataset.protocolo;
        render();
      });
    });

    document.getElementById('back-intakes')?.addEventListener('click', () => {
      state.selectedProtocolo = null;
      render();
    });

    document.getElementById('save-intake')?.addEventListener('click', saveIntake);
    document.querySelectorAll('[data-set-status]').forEach((btn) => {
      btn.addEventListener('click', () => patchIntake({ status: btn.dataset.setStatus }));
    });

    document.getElementById('sched-prev')?.addEventListener('click', () => {
      state.scheduleWeekStart = addDays(state.scheduleWeekStart, -7);
      render();
    });
    document.getElementById('sched-next')?.addEventListener('click', () => {
      state.scheduleWeekStart = addDays(state.scheduleWeekStart, 7);
      render();
    });
    document.getElementById('sched-dup')?.addEventListener('click', duplicateScheduleWeek);
    document.getElementById('sched-save')?.addEventListener('click', saveSchedule);

    document.querySelectorAll('.tpl-save').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const tr = e.target.closest('tr');
        const id = tr.dataset.tplId;
        await api('/api/admin/shift-templates/' + id, {
          method: 'PATCH',
          body: JSON.stringify({
            nome: tr.querySelector('.tpl-nome').value,
            start_time: tr.querySelector('.tpl-start').value,
            end_time: tr.querySelector('.tpl-end').value,
          }),
        });
        await loadTemplates();
        alert('Turno salvo.');
      });
    });

    document.getElementById('vol-new')?.addEventListener('click', () => showVolForm());
    document.querySelectorAll('.vol-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('tr').dataset.volId;
        const vol = (state.allVolunteers || []).find((v) => String(v.id) === id);
        showVolForm(vol);
      });
    });

    document.getElementById('cfg-save')?.addEventListener('click', async () => {
      await api('/api/admin/config', {
        method: 'PATCH',
        body: JSON.stringify({
          whatsapp_number: document.getElementById('cfg-wa').value,
          whatsapp_message_general: document.getElementById('cfg-wa-general').value,
          whatsapp_message_registro: document.getElementById('cfg-wa-reg').value,
          timezone: document.getElementById('cfg-tz').value,
          out_of_hours_message_es: document.getElementById('cfg-ooh-es').value,
          out_of_hours_message_pt: document.getElementById('cfg-ooh-pt').value,
        }),
      });
      alert('Configurações salvas.');
      render();
    });

    document.getElementById('kit-save')?.addEventListener('click', async () => {
      const splitList = (id) =>
        document
          .getElementById(id)
          .value.split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      await api('/api/admin/listing-kit', {
        method: 'PATCH',
        body: JSON.stringify({
          titulo_es: document.getElementById('kit-titulo').value,
          subtitulo_es: document.getElementById('kit-subtitulo').value,
          descricao_curta_es: document.getElementById('kit-curta').value,
          descricao_longa_es: document.getElementById('kit-longa').value,
          categorias_es: splitList('kit-categorias'),
          palavras_chave_es: splitList('kit-palavras'),
          organizacao: document.getElementById('kit-org').value,
          cnpj: document.getElementById('kit-cnpj').value,
          email_contato: document.getElementById('kit-email').value,
          cobertura: document.getElementById('kit-cobertura').value,
          idioma_atendimento: document.getElementById('kit-idioma').value,
          costo: document.getElementById('kit-costo').value,
        }),
      });
      alert('Kit salvo.');
      render();
    });

    document.getElementById('kit-copy-curta')?.addEventListener('click', (e) => {
      copyText(document.getElementById('kit-curta').value, e.target);
    });
    document.getElementById('kit-copy-longa')?.addEventListener('click', (e) => {
      copyText(document.getElementById('kit-longa').value, e.target);
    });

    document.querySelectorAll('.btn-copy-utm').forEach((btn) => {
      btn.addEventListener('click', () => copyText(btn.dataset.copy, btn));
    });

    document.querySelectorAll('.hub-save').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('[data-hub-slug]');
        const slug = card.dataset.hubSlug;
        await api('/api/admin/hubs/' + encodeURIComponent(slug), {
          method: 'PATCH',
          body: JSON.stringify({
            status: card.querySelector('.hub-status').value,
            data_cadastro: card.querySelector('.hub-data').value || null,
            url_listagem_publicada: card.querySelector('.hub-url-listagem').value || null,
            notas: card.querySelector('.hub-notas').value,
          }),
        });
        alert('Hub salvo.');
        render();
      });
    });
  }

  async function saveIntake() {
    await patchIntake({
      triagem_notes: document.getElementById('intake-notes').value,
      assigned_volunteer_id: document.getElementById('intake-volunteer').value || null,
      doctor8_registered: document.getElementById('intake-d8').checked,
    });
  }

  async function patchIntake(extra) {
    const body = {
      triagem_notes: document.getElementById('intake-notes')?.value,
      assigned_volunteer_id: document.getElementById('intake-volunteer')?.value || null,
      doctor8_registered: document.getElementById('intake-d8')?.checked,
      ...extra,
    };
    await api('/api/admin/intakes/' + encodeURIComponent(state.selectedProtocolo), {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    render();
  }

  async function duplicateScheduleWeek() {
    const prevStart = addDays(state.scheduleWeekStart, -7);
    const from = formatDate(prevStart);
    const to = formatDate(addDays(prevStart, 6));
    const data = await api(`/api/admin/schedule?from=${from}&to=${to}`);
    const items = data.schedule.map((row) => {
      const dayOffset = Math.floor(
        (new Date(row.date + 'T12:00:00') - new Date(from + 'T12:00:00')) / 86400000
      );
      const newDate = formatDate(addDays(state.scheduleWeekStart, dayOffset));
      return {
        date: newDate,
        shift_template_id: row.shift_template_id,
        volunteer_id: row.volunteer_id,
        notes: row.notes || '',
      };
    });
    if (!items.length) {
      alert('Semana anterior vazia.');
      return;
    }
    await api('/api/admin/schedule/bulk', { method: 'POST', body: JSON.stringify({ items }) });
    alert('Escala duplicada da semana anterior.');
    render();
  }

  async function saveSchedule() {
    const items = [];
    document.querySelectorAll('[data-sched-date]').forEach((sel) => {
      items.push({
        date: sel.dataset.schedDate,
        shift_template_id: Number(sel.dataset.schedTpl),
        volunteer_id: sel.value ? Number(sel.value) : null,
        notes: '',
      });
    });
    await api('/api/admin/schedule/bulk', { method: 'POST', body: JSON.stringify({ items }) });
    alert('Escala salva.');
  }

  async function renderDivulgacao() {
    const [hubData, kitData] = await Promise.all([
      api('/api/admin/hubs'),
      api('/api/admin/listing-kit'),
    ]);
    const kit = kitData.kit;
    updateNavHubBadge(hubData.published, hubData.total);

    const categorias = (kit.categorias_es || []).join(', ');
    const palavras = (kit.palavras_chave_es || []).join(', ');

    const hubCards = hubData.hubs
      .map((hub) => {
        const links = hub.utmLinks || {};
        return `
          <div class="admin-hub-card" data-hub-slug="${esc(hub.slug)}">
            <div class="admin-hub-card-header">
              <h3>${esc(hub.nome)} ${badgeHubStatus(hub.status)}</h3>
              <a href="${esc(hub.url_site)}" target="_blank" rel="noopener">${esc(hub.url_site)}</a>
            </div>
            <div class="admin-form-group">
              <label>Status</label>
              <select class="hub-status">
                ${Object.entries(HUB_STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${hub.status === k ? 'selected' : ''}>${v}</option>`).join('')}
              </select>
            </div>
            <div class="admin-form-group">
              <label>Data cadastro</label>
              <input type="date" class="hub-data" value="${esc(hub.data_cadastro || '')}">
            </div>
            <div class="admin-form-group">
              <label>URL listagem publicada</label>
              <input type="url" class="hub-url-listagem" value="${esc(hub.url_listagem_publicada || '')}" placeholder="https://...">
            </div>
            <div class="admin-form-group">
              <label>Notas internas</label>
              <textarea class="hub-notas" rows="2">${esc(hub.notas)}</textarea>
            </div>
            <div class="admin-utm-links">
              <label>Links UTM (copiar para cadastro no hub)</label>
              ${['solicitud', 'landing', 'consulta'].map((dest) => `
                <div class="admin-utm-row">
                  <span class="admin-utm-label">${dest}</span>
                  <input type="text" class="admin-utm-input" readonly value="${esc(links[dest] || '')}">
                  <button type="button" class="admin-btn admin-btn-sm admin-btn-secondary btn-copy-utm" data-copy="${esc(links[dest] || '')}">Copiar</button>
                </div>`).join('')}
            </div>
            <details class="admin-hub-instructions">
              <summary>Instruções de cadastro (PT)</summary>
              <ol>
                <li>Acesse <a href="${esc(hub.url_site)}" target="_blank" rel="noopener">${esc(hub.url_site)}</a></li>
                <li>Procure &quot;Agregar recurso&quot;, &quot;Enviar ayuda&quot; ou formulário de cadastro de organizações/recursos</li>
                <li>Cole do kit: título, descripción corta/larga, URL de solicitud (UTM), WhatsApp e e-mail de contato</li>
                <li>Marque status <strong>Em cadastro</strong> enquanto aguarda; após aprovação, <strong>Publicado</strong> + URL da listagem</li>
              </ol>
            </details>
            <button type="button" class="admin-btn admin-btn-sm hub-save">Salvar hub</button>
          </div>`;
      })
      .join('');

    const campaignRows = (hubData.campaignLinks || [])
      .map(
        (l) =>
          `<tr><td>${esc(l.hubNome)}</td><td>${esc(l.destino)}</td><td><code class="admin-utm-code">${esc(l.url)}</code></td><td><button type="button" class="admin-btn admin-btn-sm admin-btn-secondary btn-copy-utm" data-copy="${esc(l.url)}">Copiar</button></td></tr>`
      )
      .join('');

    return `
      <h1>Divulgação / Hubs</h1>
      <p class="admin-hint">Checklist itens 5–8: cadastro manual nos diretórios humanitários. Use o kit em espanhol e links UTM abaixo.</p>

      <div class="admin-panel">
        <h2>A — Kit de listagem (espanhol)</h2>
        <div class="admin-form-group"><label>Título</label><input type="text" id="kit-titulo" value="${esc(kit.titulo_es)}"></div>
        <div class="admin-form-group"><label>Subtítulo</label><input type="text" id="kit-subtitulo" value="${esc(kit.subtitulo_es)}"></div>
        <div class="admin-form-group"><label>Descripción corta (~280 chars)</label><textarea id="kit-curta" rows="3">${esc(kit.descricao_curta_es)}</textarea></div>
        <div class="admin-form-group"><label>Descripción larga</label><textarea id="kit-longa" rows="10">${esc(kit.descricao_longa_es)}</textarea></div>
        <div class="admin-form-group"><label>Categorías (separadas por vírgula)</label><input type="text" id="kit-categorias" value="${esc(categorias)}"></div>
        <div class="admin-form-group"><label>Palabras clave (separadas por vírgula)</label><input type="text" id="kit-palavras" value="${esc(palavras)}"></div>
        <div class="admin-detail-grid">
          <div class="admin-form-group"><label>Organización</label><input type="text" id="kit-org" value="${esc(kit.organizacao)}"></div>
          <div class="admin-form-group"><label>CNPJ</label><input type="text" id="kit-cnpj" value="${esc(kit.cnpj)}"></div>
          <div class="admin-form-group"><label>E-mail</label><input type="email" id="kit-email" value="${esc(kit.email_contato)}"></div>
          <div class="admin-form-group"><label>Cobertura</label><input type="text" id="kit-cobertura" value="${esc(kit.cobertura)}"></div>
          <div class="admin-form-group"><label>Idioma</label><input type="text" id="kit-idioma" value="${esc(kit.idioma_atendimento)}"></div>
          <div class="admin-form-group"><label>Costo</label><input type="text" id="kit-costo" value="${esc(kit.costo)}"></div>
        </div>
        <div class="admin-toolbar">
          <button type="button" class="admin-btn admin-btn-sm" id="kit-save">Salvar kit</button>
          <button type="button" class="admin-btn admin-btn-sm admin-btn-secondary" id="kit-copy-curta">Copiar descripción corta</button>
          <button type="button" class="admin-btn admin-btn-sm admin-btn-secondary" id="kit-copy-longa">Copiar descripción larga</button>
        </div>
        <div class="admin-preview-block">
          <strong>Preview card (hub)</strong>
          <div class="admin-hub-preview">
            <h4>${esc(kit.titulo_es)}</h4>
            <p class="admin-hub-preview-sub">${esc(kit.subtitulo_es)}</p>
            <p>${esc(kit.descricao_curta_es)}</p>
            <p><small>${esc(kit.organizacao)} · ${esc(kit.costo)} · ${esc(kit.cobertura)}</small></p>
          </div>
        </div>
      </div>

      <div class="admin-panel">
        <h2>B — Hubs (${hubData.published}/${hubData.total} publicados)</h2>
        <div class="admin-hub-grid">${hubCards}</div>
      </div>

      <div class="admin-panel">
        <h2>C — Links de campanha (UTM)</h2>
        <p class="admin-hint">Base: ${esc(hubData.siteBase)} · Tracking de cliques via analytics futuro; por ora centralize estes links nos cadastros.</p>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>Hub</th><th>Destino</th><th>URL</th><th></th></tr></thead>
            <tbody>${campaignRows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function showVolForm(vol) {
    const panel = document.getElementById('vol-form-panel');
    panel.classList.remove('admin-hidden');
    const roles = vol?.roles || [];
    panel.innerHTML = `
      <h2>${vol ? 'Editar' : 'Novo'} voluntário</h2>
      <div class="admin-form-group"><label>Nome</label><input id="vf-nome" value="${esc(vol?.nome || '')}"></div>
      <div class="admin-form-group"><label>E-mail</label><input id="vf-email" value="${esc(vol?.email || '')}"></div>
      <div class="admin-form-group"><label>WhatsApp</label><input id="vf-wa" value="${esc(vol?.whatsapp || '')}"></div>
      <div class="admin-role-checkboxes">
        ${Object.entries(ROLE_LABELS).map(([k, v]) => `<label><input type="checkbox" class="vf-role" value="${k}" ${roles.includes(k) ? 'checked' : ''}> ${v}</label>`).join('')}
      </div>
      ${vol ? `<label style="display:block;margin:0.75rem 0"><input type="checkbox" id="vf-ativo" ${vol.ativo ? 'checked' : ''}> Ativo</label>` : ''}
      <button type="button" class="admin-btn" id="vf-save">Salvar</button>`;

    document.getElementById('vf-save').addEventListener('click', async () => {
      const selectedRoles = [...document.querySelectorAll('.vf-role:checked')].map((c) => c.value);
      const payload = {
        nome: document.getElementById('vf-nome').value,
        email: document.getElementById('vf-email').value,
        whatsapp: document.getElementById('vf-wa').value,
        roles: selectedRoles,
      };
      if (vol) {
        payload.ativo = document.getElementById('vf-ativo').checked;
        await api('/api/admin/volunteers/' + vol.id, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api('/api/admin/volunteers', { method: 'POST', body: JSON.stringify(payload) });
      }
      await loadVolunteers();
      render();
    });
  }

  init();
})();
