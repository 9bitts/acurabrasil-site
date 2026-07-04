(function () {
  'use strict';

  const FALLBACK_WA = {
    number: '5531971720053',
    linkGeneral: 'https://wa.me/5531971720053?text=Hola%2C%20necesito%20atenci%C3%B3n%20gratuita%20del%20SOS%20Venezuela',
    linkRegistro: 'https://wa.me/5531971720053?text=Hola%2C%20necesito%20ayuda%20para%20registrarme%20en%20el%20SOS%20Venezuela',
  };

  function getLang() {
    return document.documentElement.lang?.startsWith('pt') ? 'pt' : 'es';
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

  function applyWhatsAppLinks(info) {
    const wa = info?.whatsapp || FALLBACK_WA;
    document.querySelectorAll('.whatsapp-float, .btn-whatsapp-secondary, .btn-whatsapp-cta, #sos-ve-whatsapp-help').forEach((el) => {
      if (!el) return;
      const isRegistro =
        el.classList.contains('btn-whatsapp-cta') ||
        el.id === 'sos-ve-whatsapp-help' ||
        (el.href && el.href.includes('registrarme'));
      el.href = isRegistro ? wa.linkRegistro : wa.linkGeneral;
    });
  }

  function renderScheduleBlock(container, info) {
    if (!container || !info) return;

    const lang = getLang();
    const msg = lang === 'pt' ? info.outOfHoursMessage?.pt : info.outOfHoursMessage?.es;

    if (info.isOpen) {
      const shifts = (info.shiftsToday || [])
        .map((s) => `<li>${escapeHtml(s.nome)}: ${escapeHtml(s.start)}–${escapeHtml(s.end)}${s.volunteer ? '' : ''}</li>`)
        .join('');
      container.innerHTML = `
        <div class="sos-schedule-open" role="status">
          <span class="sos-schedule-badge sos-schedule-badge--open">${lang === 'pt' ? 'Em horário de atendimento' : 'Estamos en horario de atención'}</span>
          ${shifts ? `<ul class="sos-schedule-shifts">${shifts}</ul>` : ''}
        </div>`;
      container.classList.remove('sos-schedule-closed');
      container.classList.add('sos-schedule-open-wrap');
    } else {
      const next = formatNextOpen(info.nextOpenAt, info.timezone);
      container.innerHTML = `
        <div class="sos-schedule-closed" role="alert">
          <span class="sos-schedule-badge sos-schedule-badge--closed">${lang === 'pt' ? 'Fora do horário' : 'Fuera de horario'}</span>
          <p class="sos-schedule-message">${escapeHtml(msg || '')}</p>
          ${next ? `<p class="sos-schedule-next"><small>${lang === 'pt' ? 'Próximo atendimento:' : 'Próxima atención:'} ${escapeHtml(next)}</small></p>` : ''}
        </div>`;
      container.classList.remove('sos-schedule-open-wrap');
      container.classList.add('sos-schedule-closed-wrap');
    }
  }

  function renderInlineHours(container, info) {
    if (!container || !info) return;
    const lang = getLang();
    const label = lang === 'pt' ? 'Horários de atendimento hoje' : 'Horarios de atención hoy';
    const shifts = (info.shiftsToday || [])
      .map((s) => `${s.nome} ${s.start}–${s.end}`)
      .join(' · ');
    const status = info.isOpen
      ? (lang === 'pt' ? ' (aberto agora)' : ' (abierto ahora)')
      : (lang === 'pt' ? ' (fechado agora)' : ' (cerrado ahora)');
    container.textContent = shifts ? `${label}: ${shifts}${status}` : label + status;
  }

  function escapeHtml(s) {
    const el = document.createElement('span');
    el.textContent = s ?? '';
    return el.innerHTML;
  }

  async function init() {
    let info;
    try {
      const res = await fetch('/api/sos-venezuela/public-info');
      if (res.ok) info = await res.json();
    } catch {
      /* fallback abaixo */
    }

    if (!info) {
      applyWhatsAppLinks(null);
      return;
    }

    applyWhatsAppLinks(info);

    const formBlock = document.getElementById('sos-schedule-status');
    renderScheduleBlock(formBlock, info);

    const consultaAside = document.getElementById('sos-schedule-info');
    renderScheduleBlock(consultaAside, info);

    const ctaHours = document.getElementById('sos-schedule-hours');
    renderInlineHours(ctaHours, info);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
