(function () {
  const form = document.getElementById('sos-ve-intake-form');
  if (!form) return;

  const successBlock = document.getElementById('sos-ve-intake-success');
  const formWrap = document.getElementById('sos-ve-intake-form-wrap');
  const statusEl = document.getElementById('sos-ve-intake-status');
  const submitBtn = form.querySelector('[type="submit"]');
  const relacionSelect = form.querySelector('#relacion');
  const nomePacienteGroup = document.getElementById('nome-paciente-group');
  const nomePacienteInput = form.querySelector('#nome_paciente');
  const protocoloEl = document.getElementById('sos-ve-protocolo');
  const whatsappHelpLink = document.getElementById('sos-ve-whatsapp-help');
  let currentProtocolo = null;

  const t = (key) => {
    if (window.AcuraI18n) {
      return window.AcuraI18n.t(window.AcuraI18n.getLang(), key);
    }
    return key;
  };

  const showStatus = (type, messageKey) => {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.className = `form-status ${type}`;
    statusEl.textContent = t(messageKey);
  };

  const clearStatus = () => {
    if (!statusEl) return;
    statusEl.hidden = true;
    statusEl.className = 'form-status';
    statusEl.textContent = '';
  };

  const validatePhoneClient = (ddi, ddd, telefone) => {
    const ddiDigits = String(ddi || '').replace(/\D/g, '');
    const dddDigits = String(ddd || '').replace(/\D/g, '');
    const telDigits = String(telefone || '').replace(/\D/g, '');
    if (!ddiDigits || !dddDigits || !telDigits) return false;
    const national = dddDigits + telDigits;
    if (ddiDigits === '58') return national.length >= 10 && national.length <= 11;
    return telDigits.length >= 7 && telDigits.length <= 11;
  };

  const toggleNomePaciente = () => {
    const isPaciente = relacionSelect?.value === 'paciente';
    if (nomePacienteGroup) {
      nomePacienteGroup.hidden = isPaciente;
    }
    if (nomePacienteInput) {
      nomePacienteInput.required = !isPaciente;
      if (isPaciente) nomePacienteInput.value = '';
    }
  };

  if (relacionSelect) {
    relacionSelect.addEventListener('change', toggleNomePaciente);
    toggleNomePaciente();
  }

  const TIPO_PARAM_MAP = {
    medica: 'medica',
    psicologica: 'psicologica',
    psicanalitica: 'psicanalise',
    integrativa: 'terapias_integrativas',
  };
  const tipoSelect = form.querySelector('#tipo_atencion');
  const urlTipo = new URLSearchParams(window.location.search).get('tipo');
  if (tipoSelect && urlTipo && TIPO_PARAM_MAP[urlTipo]) {
    tipoSelect.value = TIPO_PARAM_MAP[urlTipo];
  }

  function setIntakeProgress(step) {
    const fill = document.getElementById('intake-progress-fill');
    const bar = document.getElementById('intake-progress-bar');
    const pct = step === 3 ? '100%' : step === 2 ? '66%' : '33%';
    if (fill) fill.style.width = pct;
    if (bar) bar.setAttribute('aria-valuenow', String(step));
    document.querySelectorAll('.intake-progress-step[data-step]').forEach((el) => {
      const s = Number(el.getAttribute('data-step'));
      el.classList.toggle('is-active', s === step);
      el.classList.toggle('is-complete', s < step);
    });
  }

  setIntakeProgress(1);
  ['consentimiento', 'lgpd_privacidade'].forEach((id) => {
    const field = form.querySelector('#' + id);
    if (field) {
      field.addEventListener('focus', () => setIntakeProgress(2));
    }
  });

  function trackIntakeEvent(event) {
    if (!currentProtocolo || !event) return;
    const url = '/api/sos-venezuela/intake/' + encodeURIComponent(currentProtocolo) + '/event';
    const body = JSON.stringify({ event });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  }

  function bindSuccessTracking() {
    document.querySelectorAll('[data-intake-event]').forEach((el) => {
      el.addEventListener('click', () => trackIntakeEvent(el.dataset.intakeEvent));
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearStatus();
    toggleNomePaciente();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const ddi = form.querySelector('#ddi')?.value.trim() || '';
    const ddd = form.querySelector('#ddd')?.value.trim() || '';
    const telefone = form.querySelector('#telefone')?.value.trim() || '';
    if (!validatePhoneClient(ddi, ddd, telefone)) {
      showStatus('error', 'sosve.intake.errorPhone');
      form.querySelector('#telefone')?.focus();
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    showStatus('info', 'sosve.intake.sending');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 18_000);

      const res = await fetch('/api/sos-venezuela/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          nome: form.querySelector('#nome')?.value.trim() || '',
          email: form.querySelector('#email')?.value.trim() || '',
          ddi,
          ddd,
          telefone,
          relacion: relacionSelect?.value || '',
          nome_paciente: form.querySelector('#nome_paciente')?.value.trim() || '',
          edad: form.querySelector('#edad')?.value.trim() || '',
          ubicacion: form.querySelector('#ubicacion')?.value.trim() || '',
          tipo_atencion: form.querySelector('#tipo_atencion')?.value || '',
          prioridad: form.querySelector('#prioridad')?.value || '',
          sintomas: form.querySelector('#sintomas')?.value.trim() || '',
          observaciones: form.querySelector('#observaciones')?.value.trim() || '',
          consentimiento: form.querySelector('#consentimiento')?.checked || false,
          lgpd_privacidade: form.querySelector('#lgpd_privacidade')?.checked || false,
          website: form.querySelector('#website')?.value || '',
          referral_source: window.SosVenezuelaPublic?.getStoredReferral?.() || '',
        }),
      });

      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok && data.protocolo) {
        currentProtocolo = data.protocolo;
        if (protocoloEl) protocoloEl.textContent = data.protocolo;
        if (whatsappHelpLink) {
          const msg = t('sosve.intake.whatsappHelpMsg').replace('{protocolo}', data.protocolo);
          let number = '5531971720053';
          try {
            const infoRes = await fetch('/api/sos-venezuela/public-info');
            if (infoRes.ok) {
              const info = await infoRes.json();
              if (info?.whatsapp?.number) number = info.whatsapp.number;
            }
          } catch { /* fallback */ }
          whatsappHelpLink.href = `https://wa.me/${String(number).replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
        }
        if (formWrap) formWrap.hidden = true;
        if (successBlock) {
          successBlock.hidden = false;
          successBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        setIntakeProgress(3);
        document.dispatchEvent(
          new CustomEvent('acura:analytics', { detail: { event: 'intake_sos_enviado' } })
        );
        bindSuccessTracking();
        return;
      }

      if (res.status === 400 && data.error === 'lgpd_privacy_required') {
        showStatus('error', 'sosve.intake.errorPrivacy');
        return;
      }

      if (res.status === 429) {
        const secs = data.retryAfterSeconds;
        if (statusEl && secs > 0) {
          statusEl.hidden = false;
          statusEl.className = 'form-status error';
          statusEl.textContent = `${t('sosve.intake.errorRateLimit')} (${secs}s)`;
        } else {
          showStatus('error', 'sosve.intake.errorRateLimit');
        }
        return;
      }

      if (res.status === 400 && data.field === 'phone') {
        showStatus('error', 'sosve.intake.errorPhone');
        form.querySelector('#telefone')?.focus();
        return;
      }

      showStatus('error', 'sosve.intake.error');
    } catch {
      showStatus('error', 'sosve.intake.errorNetwork');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
})();
