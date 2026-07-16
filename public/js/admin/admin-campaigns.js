/**
 * Admin Campanhas — UI module (loaded before admin-app.js)
 * Exposes window.AcuraAdminCampaigns
 */
(function (global) {
  'use strict';

  const TYPE_LABELS = {
    emergency: 'Emergência',
    project: 'Projeto',
    research: 'Pesquisa',
    evergreen: 'Contínua',
    matching: 'Matching',
    in_kind: 'Voluntariado',
  };

  const STATUS_LABELS = {
    draft: 'Rascunho',
    scheduled: 'Agendada',
    published: 'Publicada',
    paused: 'Pausada',
    closed: 'Encerrada',
  };

  const DEST_LABELS = {
    humanitaria: 'Humanitária',
    pesquisa: 'Pesquisa',
    geral: 'Geral / institucional',
  };

  function esc(s) {
    const el = document.createElement('span');
    el.textContent = s ?? '';
    return el.innerHTML;
  }

  function money(n) {
    return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function emptyCampaign() {
    return {
      slug: '',
      type: 'project',
      status: 'draft',
      title_pt: '',
      title_es: '',
      summary_pt: '',
      summary_es: '',
      body_pt: '',
      body_es: '',
      cover_url: '/img/og-share.png',
      video_url: '',
      gallery: [],
      goal_amount: 10000,
      raised_amount: 0,
      donor_count: 0,
      show_thermometer: true,
      accepts_donation: true,
      allow_once: true,
      allow_monthly: true,
      min_amount: 5,
      max_amount: 50000,
      suggested_amounts: [30, 50, 100, 250, 500, 1000],
      destination: 'humanitaria',
      impact_text_pt: '',
      impact_text_es: '',
      matching_text_pt: '',
      matching_text_es: '',
      matching_cap: 0,
      enable_pix: true,
      enable_paypal: true,
      enable_paypal_monthly: true,
      show_donor_wall: true,
      show_donor_amounts: false,
      ends_at: '',
      publish_at: '',
      featured: false,
      sort_order: 0,
      secondary_cta_label_pt: '',
      secondary_cta_label_es: '',
      secondary_cta_url: '',
      seo_title_pt: '',
      seo_title_es: '',
      seo_description_pt: '',
      seo_description_es: '',
      utm_campaign: '',
      internal_notes: '',
      internal_owner: '',
      cost_center: '',
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

  function numVal(id) {
    return Number(val(id) || 0);
  }

  function collectForm() {
    const suggested = String(val('c-suggested') || '')
      .split(/[,\s]+/)
      .map((n) => Number(n))
      .filter((n) => n > 0);
    const gallery = String(val('c-gallery') || '')
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      slug: val('c-slug'),
      type: val('c-type'),
      status: val('c-status'),
      title_pt: val('c-title-pt'),
      title_es: val('c-title-es'),
      summary_pt: val('c-summary-pt'),
      summary_es: val('c-summary-es'),
      body_pt: val('c-body-pt'),
      body_es: val('c-body-es'),
      cover_url: val('c-cover'),
      video_url: val('c-video'),
      gallery,
      goal_amount: numVal('c-goal'),
      raised_amount: numVal('c-raised'),
      donor_count: numVal('c-donors'),
      show_thermometer: val('c-thermo'),
      accepts_donation: val('c-accepts'),
      allow_once: val('c-once'),
      allow_monthly: val('c-monthly'),
      min_amount: numVal('c-min'),
      max_amount: numVal('c-max'),
      suggested_amounts: suggested,
      destination: val('c-dest'),
      impact_text_pt: val('c-impact-pt'),
      impact_text_es: val('c-impact-es'),
      matching_text_pt: val('c-match-pt'),
      matching_text_es: val('c-match-es'),
      matching_cap: numVal('c-match-cap'),
      enable_pix: val('c-pix'),
      enable_paypal: val('c-paypal'),
      enable_paypal_monthly: val('c-paypal-m'),
      show_donor_wall: val('c-wall'),
      show_donor_amounts: val('c-wall-amt'),
      ends_at: val('c-ends') || null,
      publish_at: val('c-publish') || null,
      featured: val('c-featured'),
      sort_order: numVal('c-sort'),
      secondary_cta_label_pt: val('c-cta-pt'),
      secondary_cta_label_es: val('c-cta-es'),
      secondary_cta_url: val('c-cta-url'),
      seo_title_pt: val('c-seo-title-pt'),
      seo_title_es: val('c-seo-title-es'),
      seo_description_pt: val('c-seo-desc-pt'),
      seo_description_es: val('c-seo-desc-es'),
      utm_campaign: val('c-utm'),
      internal_notes: val('c-notes'),
      internal_owner: val('c-owner'),
      cost_center: val('c-cost'),
    };
  }

  async function renderList(api, state) {
    const q = state.campaignFilterQ || '';
    const status = state.campaignFilterStatus || '';
    const type = state.campaignFilterType || '';
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (status) qs.set('status', status);
    if (type) qs.set('type', type);
    const data = await api('/api/admin/campaigns?' + qs.toString());
    const rows = (data.campaigns || [])
      .map(
        (c) => `<tr data-campaign-id="${c.id}" style="cursor:pointer">
        <td><img src="${esc(c.cover_url)}" alt="" width="48" height="32" style="object-fit:cover;border-radius:4px" onerror="this.style.display='none'"></td>
        <td><strong>${esc(c.title_pt)}</strong><br><code>${esc(c.slug)}</code></td>
        <td>${esc(TYPE_LABELS[c.type] || c.type)}</td>
        <td><span class="badge badge-${c.status === 'published' ? 'em_consulta' : c.status === 'draft' ? 'nova' : c.status === 'paused' ? 'em_triagem' : 'cancelado'}">${esc(STATUS_LABELS[c.status] || c.status)}</span></td>
        <td>${money(c.raised_amount)}${c.goal_amount ? ` / ${money(c.goal_amount)}` : ''}</td>
        <td>${c.donor_count || 0}</td>
        <td>
          <a class="admin-btn admin-btn-sm admin-btn-secondary" href="/campanhas/${esc(c.slug)}" target="_blank" rel="noopener" data-stop>Ver</a>
        </td>
      </tr>`
      )
      .join('');

    return `
      <div class="admin-header-row">
        <h1>Campanhas</h1>
        <button type="button" class="admin-btn" id="campaign-new">+ Nova campanha</button>
      </div>
      <p class="admin-muted">Crie e publique campanhas. Só status <strong>Publicada</strong> (e Pausada/Encerrada) aparecem no site em <strong>Campanhas</strong>.</p>
      <div class="admin-filters" style="display:flex;gap:0.75rem;flex-wrap:wrap;margin:1rem 0">
        <input type="search" id="campaign-filter-q" placeholder="Buscar título ou slug" value="${esc(q)}" style="min-width:180px">
        <select id="campaign-filter-status">
          <option value="">Todos os status</option>
          ${Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${k}" ${status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <select id="campaign-filter-type">
          <option value="">Todos os tipos</option>
          ${Object.entries(TYPE_LABELS).map(([k, v]) => `<option value="${k}" ${type === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <button type="button" class="admin-btn admin-btn-sm" id="campaign-filter-apply">Filtrar</button>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th></th><th>Campanha</th><th>Tipo</th><th>Status</th><th>Arrecadado</th><th>Doadores</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7">Nenhuma campanha ainda.</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  async function renderEditor(api, state) {
    const isNew = state.campaignEditId === 'new';
    let campaign = emptyCampaign();
    let updates = [];
    let faqs = [];
    let donations = [];

    if (!isNew) {
      const data = await api('/api/admin/campaigns/' + state.campaignEditId);
      campaign = { ...emptyCampaign(), ...data.campaign };
      updates = data.updates || [];
      faqs = data.faqs || [];
      donations = data.donations || [];
    }

    const faqRows = (faqs.length ? faqs : [{ question_pt: '', question_es: '', answer_pt: '', answer_es: '' }])
      .map(
        (f, i) => `<div class="admin-card" data-faq-row style="margin-bottom:0.75rem">
        <div class="admin-grid-2">
          ${field(`faq-q-pt-${i}`, `Pergunta PT #${i + 1}`, f.question_pt)}
          ${field(`faq-q-es-${i}`, `Pergunta ES #${i + 1}`, f.question_es)}
          ${field(`faq-a-pt-${i}`, 'Resposta PT', f.answer_pt, { type: 'textarea', rows: 2 })}
          ${field(`faq-a-es-${i}`, 'Resposta ES', f.answer_es, { type: 'textarea', rows: 2 })}
        </div>
      </div>`
      )
      .join('');

    const updateRows = updates
      .map(
        (u) => `<li>
          <strong>${esc(u.title_pt)}</strong> (${u.published ? 'pública' : 'rascunho'})
          <button type="button" class="admin-btn admin-btn-sm admin-btn-danger" data-del-update="${u.id}">Excluir</button>
        </li>`
      )
      .join('');

    const donationRows = donations
      .slice(0, 50)
      .map(
        (d) => `<tr>
        <td>${esc(String(d.created_at || '').slice(0, 16))}</td>
        <td>${money(d.amount)}</td>
        <td>${esc(d.method)}</td>
        <td>${esc(d.status)}</td>
        <td>${d.anonymous ? 'Anônimo' : esc(d.donor_name || '—')}</td>
        <td>${d.status !== 'confirmed' ? `<button type="button" class="admin-btn admin-btn-sm" data-confirm-donation="${d.id}">Confirmar</button>` : '—'}</td>
      </tr>`
      )
      .join('');

    return `
      <div class="admin-header-row">
        <h1>${isNew ? 'Nova campanha' : 'Editar campanha'}</h1>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button type="button" class="admin-btn admin-btn-secondary" id="campaign-back">← Lista</button>
          ${!isNew ? `<button type="button" class="admin-btn admin-btn-secondary" id="campaign-dup">Duplicar</button>` : ''}
          ${!isNew ? `<button type="button" class="admin-btn admin-btn-danger" id="campaign-del">Excluir</button>` : ''}
          <button type="button" class="admin-btn" id="campaign-save">Salvar</button>
        </div>
      </div>

      <div class="admin-card" style="margin-bottom:1rem">
        <h2>Identidade</h2>
        <div class="admin-grid-2">
          ${field('c-title-pt', 'Título PT *', campaign.title_pt)}
          ${field('c-title-es', 'Título ES *', campaign.title_es)}
          ${field('c-slug', 'Slug (URL) *', campaign.slug)}
          ${field('c-type', 'Tipo', campaign.type, { type: 'select', options: Object.entries(TYPE_LABELS) })}
          ${field('c-status', 'Status', campaign.status, { type: 'select', options: Object.entries(STATUS_LABELS) })}
          ${field('c-dest', 'Destino contábil', campaign.destination, { type: 'select', options: Object.entries(DEST_LABELS) })}
          ${field('c-summary-pt', 'Resumo PT *', campaign.summary_pt, { type: 'textarea', rows: 2 })}
          ${field('c-summary-es', 'Resumo ES *', campaign.summary_es, { type: 'textarea', rows: 2 })}
          ${field('c-body-pt', 'História PT *', campaign.body_pt, { type: 'textarea', rows: 8 })}
          ${field('c-body-es', 'História ES *', campaign.body_es, { type: 'textarea', rows: 8 })}
          ${field('c-cover', 'URL da capa *', campaign.cover_url)}
          ${field('c-video', 'URL do vídeo (YouTube/Vimeo)', campaign.video_url)}
          ${field('c-gallery', 'Galeria (URLs, uma por linha)', (campaign.gallery || []).join('\n'), { type: 'textarea', rows: 3 })}
        </div>
      </div>

      <div class="admin-card" style="margin-bottom:1rem">
        <h2>Captação</h2>
        <div class="admin-grid-2">
          ${field('c-goal', 'Meta (R$)', campaign.goal_amount, { type: 'number', min: 0, step: '0.01' })}
          ${field('c-raised', 'Arrecadado oficial (R$)', campaign.raised_amount, { type: 'number', min: 0, step: '0.01' })}
          ${field('c-donors', 'Nº de doadores', campaign.donor_count, { type: 'number', min: 0 })}
          ${field('c-suggested', 'Valores sugeridos (vírgula)', (campaign.suggested_amounts || []).join(', '))}
          ${field('c-min', 'Mínimo (R$)', campaign.min_amount, { type: 'number', min: 5 })}
          ${field('c-max', 'Máximo (R$)', campaign.max_amount, { type: 'number', min: 5 })}
          ${field('c-ends', 'Data fim (YYYY-MM-DD)', campaign.ends_at || '', { type: 'date' })}
          ${field('c-publish', 'Publicar em (YYYY-MM-DD)', campaign.publish_at || '', { type: 'date' })}
          ${field('c-impact-pt', 'Texto de impacto PT', campaign.impact_text_pt)}
          ${field('c-impact-es', 'Texto de impacto ES', campaign.impact_text_es)}
          ${field('c-match-pt', 'Matching texto PT', campaign.matching_text_pt)}
          ${field('c-match-es', 'Matching texto ES', campaign.matching_text_es)}
          ${field('c-match-cap', 'Matching teto (R$)', campaign.matching_cap, { type: 'number', min: 0 })}
          ${field('c-sort', 'Ordem na lista', campaign.sort_order, { type: 'number' })}
        </div>
        <div class="admin-check-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.5rem;margin-top:1rem">
          ${field('c-thermo', 'Mostrar termômetro', campaign.show_thermometer, { type: 'checkbox' })}
          ${field('c-accepts', 'Aceita doação financeira', campaign.accepts_donation, { type: 'checkbox' })}
          ${field('c-once', 'Permitir doação única', campaign.allow_once, { type: 'checkbox' })}
          ${field('c-monthly', 'Permitir mensal', campaign.allow_monthly, { type: 'checkbox' })}
          ${field('c-pix', 'Habilitar Pix', campaign.enable_pix, { type: 'checkbox' })}
          ${field('c-paypal', 'Habilitar PayPal (cartão)', campaign.enable_paypal, { type: 'checkbox' })}
          ${field('c-paypal-m', 'Habilitar PayPal mensal', campaign.enable_paypal_monthly, { type: 'checkbox' })}
          ${field('c-wall', 'Mural de doadores', campaign.show_donor_wall, { type: 'checkbox' })}
          ${field('c-wall-amt', 'Mostrar valores no mural', campaign.show_donor_amounts, { type: 'checkbox' })}
          ${field('c-featured', 'Destaque na lista', campaign.featured, { type: 'checkbox' })}
        </div>
      </div>

      <div class="admin-card" style="margin-bottom:1rem">
        <h2>CTA secundário, SEO e interno</h2>
        <div class="admin-grid-2">
          ${field('c-cta-pt', 'CTA secundário PT', campaign.secondary_cta_label_pt)}
          ${field('c-cta-es', 'CTA secundário ES', campaign.secondary_cta_label_es)}
          ${field('c-cta-url', 'URL do CTA', campaign.secondary_cta_url)}
          ${field('c-utm', 'utm_campaign', campaign.utm_campaign || campaign.slug)}
          ${field('c-seo-title-pt', 'SEO title PT', campaign.seo_title_pt)}
          ${field('c-seo-title-es', 'SEO title ES', campaign.seo_title_es)}
          ${field('c-seo-desc-pt', 'SEO description PT', campaign.seo_description_pt)}
          ${field('c-seo-desc-es', 'SEO description ES', campaign.seo_description_es)}
          ${field('c-owner', 'Responsável interno', campaign.internal_owner)}
          ${field('c-cost', 'Centro de custo', campaign.cost_center)}
          ${field('c-notes', 'Notas internas (não vão ao site)', campaign.internal_notes, { type: 'textarea', rows: 3 })}
        </div>
      </div>

      ${
        !isNew
          ? `
      <div class="admin-card" style="margin-bottom:1rem">
        <h2>Atualizações públicas</h2>
        <ul>${updateRows || '<li>Nenhuma atualização.</li>'}</ul>
        <div class="admin-grid-2">
          ${field('u-title-pt', 'Nova atualização — título PT', '')}
          ${field('u-title-es', 'Título ES', '')}
          ${field('u-body-pt', 'Texto PT', '', { type: 'textarea', rows: 3 })}
          ${field('u-body-es', 'Texto ES', '', { type: 'textarea', rows: 3 })}
        </div>
        <label class="admin-check"><input type="checkbox" id="u-published" checked> Publicar no site</label>
        <button type="button" class="admin-btn admin-btn-sm" id="campaign-add-update" style="margin-top:0.75rem">Adicionar atualização</button>
      </div>

      <div class="admin-card" style="margin-bottom:1rem">
        <h2>FAQ da campanha</h2>
        <div id="faq-list">${faqRows}</div>
        <button type="button" class="admin-btn admin-btn-sm admin-btn-secondary" id="faq-add-row">+ Pergunta</button>
        <button type="button" class="admin-btn admin-btn-sm" id="faq-save" style="margin-left:0.5rem">Salvar FAQs</button>
      </div>

      <div class="admin-card" style="margin-bottom:1rem">
        <h2>Doações registradas</h2>
        <div class="admin-grid-2" style="margin-bottom:1rem">
          ${field('d-amount', 'Registrar doação manual (R$)', '', { type: 'number', min: 5, step: '0.01' })}
          ${field('d-name', 'Nome do doador', '')}
          ${field('d-email', 'E-mail', '')}
          ${field('d-method', 'Método', 'manual', { type: 'select', options: [['manual', 'Manual'], ['pix', 'Pix'], ['paypal', 'PayPal']] })}
        </div>
        <button type="button" class="admin-btn admin-btn-sm" id="campaign-add-donation">Adicionar e somar ao arrecadado</button>
        <div class="admin-table-wrap" style="margin-top:1rem">
          <table class="admin-table admin-table-compact">
            <thead><tr><th>Data</th><th>Valor</th><th>Método</th><th>Status</th><th>Doador</th><th></th></tr></thead>
            <tbody>${donationRows || '<tr><td colspan="6">Nenhuma doação.</td></tr>'}</tbody>
          </table>
        </div>
      </div>`
          : '<p class="admin-muted">Salve a campanha para gerenciar atualizações, FAQ e doações.</p>'
      }`;
  }

  async function render(api, state) {
    if (state.campaignEditId) return renderEditor(api, state);
    return renderList(api, state);
  }

  function bind(api, state, renderAll) {
    document.getElementById('campaign-new')?.addEventListener('click', () => {
      state.campaignEditId = 'new';
      renderAll();
    });

    document.getElementById('campaign-filter-apply')?.addEventListener('click', () => {
      state.campaignFilterQ = document.getElementById('campaign-filter-q')?.value || '';
      state.campaignFilterStatus = document.getElementById('campaign-filter-status')?.value || '';
      state.campaignFilterType = document.getElementById('campaign-filter-type')?.value || '';
      renderAll();
    });

    document.querySelectorAll('[data-campaign-id]').forEach((tr) => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('[data-stop]')) return;
        state.campaignEditId = Number(tr.dataset.campaignId);
        renderAll();
      });
    });

    document.getElementById('campaign-back')?.addEventListener('click', () => {
      state.campaignEditId = null;
      renderAll();
    });

    document.getElementById('campaign-save')?.addEventListener('click', async () => {
      const body = collectForm();
      try {
        if (state.campaignEditId === 'new') {
          const data = await api('/api/admin/campaigns', { method: 'POST', body: JSON.stringify(body) });
          state.campaignEditId = data.campaign.id;
          alert('Campanha criada.');
        } else {
          await api('/api/admin/campaigns/' + state.campaignEditId, {
            method: 'PATCH',
            body: JSON.stringify(body),
          });
          alert('Campanha salva.');
        }
        renderAll();
      } catch (err) {
        alert('Erro ao salvar: ' + err.message);
      }
    });

    document.getElementById('campaign-dup')?.addEventListener('click', async () => {
      const data = await api('/api/admin/campaigns/' + state.campaignEditId + '/duplicate', {
        method: 'POST',
        body: '{}',
      });
      state.campaignEditId = data.campaign.id;
      alert('Cópia criada como rascunho.');
      renderAll();
    });

    document.getElementById('campaign-del')?.addEventListener('click', async () => {
      if (!confirm('Excluir esta campanha permanentemente?')) return;
      await api('/api/admin/campaigns/' + state.campaignEditId, { method: 'DELETE' });
      state.campaignEditId = null;
      renderAll();
    });

    document.getElementById('campaign-add-update')?.addEventListener('click', async () => {
      await api('/api/admin/campaigns/' + state.campaignEditId + '/updates', {
        method: 'POST',
        body: JSON.stringify({
          title_pt: val('u-title-pt'),
          title_es: val('u-title-es'),
          body_pt: val('u-body-pt'),
          body_es: val('u-body-es'),
          published: val('u-published'),
        }),
      });
      renderAll();
    });

    document.querySelectorAll('[data-del-update]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api(
          '/api/admin/campaigns/' + state.campaignEditId + '/updates/' + btn.dataset.delUpdate,
          { method: 'DELETE' }
        );
        renderAll();
      });
    });

    document.getElementById('faq-add-row')?.addEventListener('click', () => {
      const list = document.getElementById('faq-list');
      if (!list) return;
      const i = list.querySelectorAll('[data-faq-row]').length;
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="admin-card" data-faq-row style="margin-bottom:0.75rem">
        <div class="admin-grid-2">
          ${field(`faq-q-pt-${i}`, `Pergunta PT #${i + 1}`, '')}
          ${field(`faq-q-es-${i}`, `Pergunta ES #${i + 1}`, '')}
          ${field(`faq-a-pt-${i}`, 'Resposta PT', '', { type: 'textarea', rows: 2 })}
          ${field(`faq-a-es-${i}`, 'Resposta ES', '', { type: 'textarea', rows: 2 })}
        </div>
      </div>`;
      list.appendChild(wrap.firstElementChild);
    });

    document.getElementById('faq-save')?.addEventListener('click', async () => {
      const rows = [...document.querySelectorAll('[data-faq-row]')];
      const faqs = rows
        .map((_, i) => ({
          question_pt: val(`faq-q-pt-${i}`),
          question_es: val(`faq-q-es-${i}`),
          answer_pt: val(`faq-a-pt-${i}`),
          answer_es: val(`faq-a-es-${i}`),
          sort_order: i,
        }))
        .filter((f) => f.question_pt || f.question_es);
      await api('/api/admin/campaigns/' + state.campaignEditId + '/faqs', {
        method: 'PUT',
        body: JSON.stringify({ faqs }),
      });
      alert('FAQs salvas.');
      renderAll();
    });

    document.getElementById('campaign-add-donation')?.addEventListener('click', async () => {
      await api('/api/admin/campaigns/' + state.campaignEditId + '/donations', {
        method: 'POST',
        body: JSON.stringify({
          amount: numVal('d-amount'),
          donor_name: val('d-name'),
          donor_email: val('d-email'),
          method: val('d-method'),
          status: 'confirmed',
        }),
      });
      renderAll();
    });

    document.querySelectorAll('[data-confirm-donation]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api('/api/admin/donations/' + btn.dataset.confirmDonation + '/confirm', {
          method: 'POST',
          body: '{}',
        });
        renderAll();
      });
    });
  }

  global.AcuraAdminCampaigns = { render, bind, TYPE_LABELS, STATUS_LABELS };
})(typeof window !== 'undefined' ? window : global);
