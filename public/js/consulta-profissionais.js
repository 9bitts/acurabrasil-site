(function () {
  const grid = document.getElementById('consulta-prof-grid');
  if (!grid) return;

  const searchInput = document.getElementById('consulta-prof-search');
  const filterSelect = document.getElementById('consulta-prof-filter');
  const countEl = document.getElementById('consulta-prof-count');
  const emptyEl = document.getElementById('consulta-prof-empty');
  const DOCTOR8_URL = 'https://app.doctor8.org/urgent';

  let professionals = [];
  let profissoes = [];

  const t = (key) => {
    if (window.AcuraI18n) {
      return window.AcuraI18n.t(window.AcuraI18n.getLang(), key);
    }
    return key;
  };

  const escapeHtml = (str) =>
    String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const truncateBio = (bio, max = 140) => {
    const flat = bio.replace(/\s+/g, ' ').trim();
    if (flat.length <= max) return flat;
    return `${flat.slice(0, max).trim()}…`;
  };

  const matchesQuery = (prof, query) => {
    if (!query) return true;
    const haystack = [
      prof.name,
      prof.registro,
      prof.location,
      prof.bio,
      ...(prof.profissao || []),
      ...(prof.especialidade || []),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  };

  const renderCard = (prof) => {
    const profissao = (prof.profissao || []).join(' · ');
    const tags = (prof.especialidade || []).slice(0, 4);
    const extraTags = Math.max(0, (prof.especialidade || []).length - tags.length);
    const bio = truncateBio(prof.bio || '');

    const tagsHtml = tags
      .map((tag) => `<span class="consulta-prof-tag">${escapeHtml(tag)}</span>`)
      .join('');
    const extraTagHtml =
      extraTags > 0 ? `<span class="consulta-prof-tag consulta-prof-tag--more">+${extraTags}</span>` : '';

    const photoHtml = prof.photo
      ? `<img src="${escapeHtml(prof.photo)}" alt="" class="consulta-prof-photo" loading="lazy" width="96" height="96">`
      : `<div class="consulta-prof-photo consulta-prof-photo--placeholder" aria-hidden="true">${escapeHtml(prof.initials || '')}</div>`;

    const badges = [];
    if (prof.volunteerBadge) {
      badges.push(`<span class="consulta-prof-badge">${escapeHtml(t('consulta.prof.badge.volunteer'))}</span>`);
    }
    if (prof.doctor8) {
      badges.push(`<span class="consulta-prof-badge consulta-prof-badge--d8">Doctor8</span>`);
    }

    const actions = [];
    actions.push(
      `<a href="${DOCTOR8_URL}" class="btn btn-consulta-principal consulta-prof-btn-primary" target="_blank" rel="noopener">${escapeHtml(t('consulta.prof.btn.consult'))}</a>`
    );

    if (prof.agendamento) {
      actions.push(
        `<a href="${escapeHtml(prof.agendamento)}" class="consulta-prof-action" target="_blank" rel="noopener" title="${escapeHtml(t('consulta.prof.btn.whatsapp'))}">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
          <span>${escapeHtml(t('consulta.prof.btn.whatsapp'))}</span>
        </a>`
      );
    }

    if (prof.curriculo) {
      actions.push(
        `<a href="${escapeHtml(prof.curriculo)}" class="consulta-prof-action" target="_blank" rel="noopener" title="${escapeHtml(t('consulta.prof.btn.cv'))}">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span>${escapeHtml(t('consulta.prof.btn.cv'))}</span>
        </a>`
      );
    }

    const secondaryActions = actions.slice(1);
    const primaryAction = actions[0] || '';

    return `<article class="consulta-prof-card" data-initials="${escapeHtml(prof.initials || '?')}">
      <div class="consulta-prof-card-top">
        ${photoHtml}
        ${badges.length ? `<div class="consulta-prof-badges">${badges.join('')}</div>` : ''}
      </div>
      <h3 class="consulta-prof-name">${escapeHtml(prof.name)}</h3>
      ${profissao ? `<p class="consulta-prof-role">${escapeHtml(profissao)}</p>` : ''}
      ${prof.registro ? `<p class="consulta-prof-registro">${escapeHtml(prof.registro)}</p>` : ''}
      ${tags.length ? `<div class="consulta-prof-tags">${tagsHtml}${extraTagHtml}</div>` : ''}
      ${bio ? `<p class="consulta-prof-bio">${escapeHtml(bio)}</p>` : ''}
      ${prof.location ? `<p class="consulta-prof-location"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>${escapeHtml(prof.location)}</p>` : ''}
      <div class="consulta-prof-actions">
        ${primaryAction}
        ${secondaryActions.length ? `<div class="consulta-prof-actions-secondary">${secondaryActions.join('')}</div>` : ''}
      </div>
    </article>`;
  };

  const render = () => {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const filter = filterSelect?.value || '';

    const filtered = professionals.filter((prof) => {
      const profMatch =
        !filter || (prof.profissao || []).some((p) => p === filter);
      return profMatch && matchesQuery(prof, query);
    });

    grid.innerHTML = filtered.map(renderCard).join('');

    if (countEl) {
      countEl.textContent = t('consulta.prof.count').replace('{n}', String(filtered.length));
    }

    if (emptyEl) {
      emptyEl.hidden = filtered.length > 0;
    }

    grid.querySelectorAll('.consulta-prof-photo').forEach((img) => {
      if (img.tagName !== 'IMG') return;
      img.addEventListener('error', () => {
        const article = img.closest('.consulta-prof-card');
        const initials = article?.dataset.initials || '?';
        const placeholder = document.createElement('div');
        placeholder.className = 'consulta-prof-photo consulta-prof-photo--placeholder';
        placeholder.setAttribute('aria-hidden', 'true');
        placeholder.textContent = initials;
        img.replaceWith(placeholder);
      });
    });
  };

  const populateFilter = () => {
    if (!filterSelect) return;
    const current = filterSelect.value;
    filterSelect.innerHTML = `<option value="">${escapeHtml(t('consulta.prof.filter.all'))}</option>`;
    profissoes.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      filterSelect.appendChild(opt);
    });
    filterSelect.value = current;
  };

  const init = async () => {
    try {
      const res = await fetch('data/profissionais-consulta.json');
      if (!res.ok) throw new Error('fetch failed');
      professionals = await res.json();
      profissoes = [...new Set(professionals.flatMap((p) => p.profissao || []))].sort((a, b) =>
        a.localeCompare(b, 'pt-BR')
      );
      populateFilter();
      render();
    } catch {
      grid.innerHTML = `<p class="consulta-prof-error">${escapeHtml(t('consulta.prof.error'))}</p>`;
    }
  };

  searchInput?.addEventListener('input', render);
  filterSelect?.addEventListener('change', render);

  document.addEventListener('acura:langchange', () => {
    populateFilter();
    render();
  });

  init();
})();
