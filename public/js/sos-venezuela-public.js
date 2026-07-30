(function () {
  'use strict';

  const FALLBACK_WA = {
    number: (window.ACURA_WHATSAPP_CONTACT && window.ACURA_WHATSAPP_CONTACT.number) || '491749803699',
    linkGeneral: 'https://wa.me/491749803699?text=Hola%2C%20necesito%20atenci%C3%B3n%20humanitaria%20gratuita%20de%20ACURABRASIL',
    linkRegistro: 'https://wa.me/491749803699?text=Hola%2C%20necesito%20ayuda%20para%20registrarme%20en%20la%20atenci%C3%B3n%20humanitaria%20de%20ACURABRASIL',
  };

  const FALLBACK_SOLICITUD_MSG = {
    es: 'Hola, solicito atención gratuita SOS Venezuela.\n\nNombre: \nCiudad: \nTipo de atención (médica/psicológica): \nSíntomas: ',
    pt: 'Olá, solicito atendimento gratuito SOS Venezuela.\n\nNome: \nCidade: \nTipo de atendimento (médica/psicológica): \nSintomas: ',
  };

  let cachedWaNumber = FALLBACK_WA.number;
  let cachedPublicInfo = null;

  function getLang() {
    if (window.AcuraI18n?.getLang) {
      return window.AcuraI18n.getLang();
    }
    return document.documentElement.lang?.startsWith('pt') ? 'pt' : 'es';
  }

  function i18n(key) {
    const lang = getLang();
    if (window.AcuraI18n?.t) {
      const value = window.AcuraI18n.t(lang, key);
      if (value && value !== key) return value;
    }
    return key;
  }

  function getSolicitudMessage() {
    const preferConsulta = document.body?.dataset?.waMsg === 'consulta'
      || /atendimento-humanitario/i.test(window.location.pathname || '');
    if (preferConsulta) {
      const generic = i18n('consulta.whatsapp.message');
      if (generic && generic !== 'consulta.whatsapp.message') return generic;
    }
    const fromI18n = i18n('sosve.whatsapp.solicitud.message');
    if (fromI18n && fromI18n !== 'sosve.whatsapp.solicitud.message') return fromI18n;
    const lang = getLang();
    return FALLBACK_SOLICITUD_MSG[lang] || FALLBACK_SOLICITUD_MSG.es;
  }

  // Solicitudes por cartão whatsapp-solicitud: el equipo de triaje las registra manualmente
  // en el admin SOS — no pasan por /api/sos-venezuela/intake.
  function normalizeWaNumber(raw) {
    if (window.ACURA_WHATSAPP_CONTACT?.normalize) {
      return window.ACURA_WHATSAPP_CONTACT.normalize(raw);
    }
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits === '5531971720053' || digits === '553197170053') return '491749803699';
    return digits || '491749803699';
  }

  function applySolicitudWhatsAppLinks(number) {
    const n = normalizeWaNumber(number || cachedWaNumber || FALLBACK_WA.number);
    cachedWaNumber = n;
    const href = `https://wa.me/${n}?text=${encodeURIComponent(getSolicitudMessage())}`;
    document.querySelectorAll('.btn-whatsapp-solicitud').forEach((el) => {
      el.href = href;
    });
  }

  function buildWaLink(number, message) {
    const n = normalizeWaNumber(number || FALLBACK_WA.number);
    return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
  }

  function buildLocalizedWhatsAppLinks(number) {
    return {
      number: normalizeWaNumber(number || FALLBACK_WA.number),
      linkGeneral: buildWaLink(number, i18n('common.whatsapp.msgGeneral')),
      linkRegistro: buildWaLink(number, i18n('common.whatsapp.msgRegistro')),
    };
  }

  function formatNextOpen(isoStr, timezone) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString(getLang() === 'pt' ? 'pt-BR' : 'es-VE', {
        timeZone: timezone || 'America/Sao_Paulo',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  }

  function applyWhatsAppLinks(info, opts = {}) {
    const waNumber = info?.whatsapp?.number || cachedWaNumber || FALLBACK_WA.number;
    const wa = buildLocalizedWhatsAppLinks(waNumber);
    const skipIds = new Set(['sos-ve-whatsapp-help', 'sos-ve-whatsapp-protocol', ...(opts.skipIds || [])]);

    document.querySelectorAll('.whatsapp-float, .btn-whatsapp-cta').forEach((el) => {
      if (!el || skipIds.has(el.id)) return;
      el.href = el.classList.contains('btn-whatsapp-cta') ? wa.linkRegistro : wa.linkGeneral;
    });

    document.querySelectorAll('.btn-whatsapp-secondary').forEach((el) => {
      if (!el || skipIds.has(el.id)) return;
      el.href = wa.linkGeneral;
    });
  }

  function renderScheduleBlock(container, info) {
    if (!container || !info) return;

    const msg = getLang() === 'pt' ? info.outOfHoursMessage?.pt : info.outOfHoursMessage?.es;

    if (info.isOpen) {
      const shifts = (info.shiftsToday || [])
        .map((s) => `<li>${escapeHtml(s.nome)}: ${escapeHtml(s.start)}–${escapeHtml(s.end)}</li>`)
        .join('');
      container.innerHTML = `
        <div class="sos-schedule-open" role="status">
          <span class="sos-schedule-badge sos-schedule-badge--open">${escapeHtml(i18n('sosve.schedule.open'))}</span>
          ${shifts ? `<ul class="sos-schedule-shifts">${shifts}</ul>` : ''}
        </div>`;
      container.classList.remove('sos-schedule-closed');
      container.classList.add('sos-schedule-open-wrap');
    } else {
      const next = formatNextOpen(info.nextOpenAt, info.timezone);
      container.innerHTML = `
        <div class="sos-schedule-closed" role="alert">
          <span class="sos-schedule-badge sos-schedule-badge--closed">${escapeHtml(i18n('sosve.schedule.closed'))}</span>
          <p class="sos-schedule-message">${escapeHtml(msg || '')}</p>
          ${next ? `<p class="sos-schedule-next"><small>${escapeHtml(i18n('sosve.schedule.nextOpen'))} ${escapeHtml(next)}</small></p>` : ''}
        </div>`;
      container.classList.remove('sos-schedule-open-wrap');
      container.classList.add('sos-schedule-closed-wrap');
    }
  }

  function renderInlineHours(container, info) {
    if (!container || !info) return;
    const label = i18n('sosve.schedule.hoursToday');
    const shifts = (info.shiftsToday || [])
      .map((s) => `${s.nome} ${s.start}–${s.end}`)
      .join(' · ');
    const status = info.isOpen
      ? i18n('sosve.schedule.statusOpen')
      : i18n('sosve.schedule.statusClosed');
    container.textContent = shifts ? `${label}: ${shifts}${status}` : label + status;
  }

  function renderPublicSurfaces(info) {
    if (!info) return;

    const scheduleStatus = document.getElementById('sos-schedule-status');
    const scheduleInfo = document.getElementById('sos-schedule-info');

    if (scheduleStatus) {
      renderScheduleBlock(scheduleStatus, info);
      scheduleStatus.hidden = false;
    }
    if (scheduleInfo) {
      renderScheduleBlock(scheduleInfo, info);
    }

    renderInlineHours(document.getElementById('sos-schedule-hours'), info);
  }

  function refreshLocalizedContent() {
    applyWhatsAppLinks(cachedPublicInfo);
    applySolicitudWhatsAppLinks(cachedPublicInfo?.whatsapp?.number || cachedWaNumber);
    renderPublicSurfaces(cachedPublicInfo);
  }

  function escapeHtml(s) {
    const el = document.createElement('span');
    el.textContent = s ?? '';
    return el.innerHTML;
  }

  async function init() {
    captureReferral();
    let info;
    try {
      const res = await fetch('/api/sos-venezuela/public-info');
      if (res.ok) info = await res.json();
    } catch {
      /* fallback abaixo */
    }

    cachedPublicInfo = info || null;
    refreshLocalizedContent();
  }

  function captureReferral() {
    try {
      const params = new URLSearchParams(window.location.search);
      const src = params.get('utm_source');
      if (src) {
        localStorage.setItem('sos_ve_referral', String(src).slice(0, 64));
      }
    } catch {
      /* ignore */
    }
  }

  function getStoredReferral() {
    try {
      return localStorage.getItem('sos_ve_referral') || '';
    } catch {
      return '';
    }
  }

  window.SosVenezuelaPublic = {
    applyWhatsAppLinks,
    applySolicitudWhatsAppLinks,
    refreshLocalizedContent,
    getStoredReferral,
    buildWaHelpLink(number, text) {
      return buildWaLink(number, text);
    },
  };

  document.addEventListener('acura:langchange', refreshLocalizedContent);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
