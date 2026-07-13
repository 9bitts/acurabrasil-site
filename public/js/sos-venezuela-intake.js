(function () {
  const form = document.getElementById('sos-ve-intake-form');
  if (!form) return;

  const DRAFT_KEY = 'sos_ve_intake_draft_v2';
  const INTAKE_TOKEN_STORAGE_KEY = 'sos_ve_intake_token';
  const DRAFT_DEBOUNCE_MS = 400;

  const successBlock = document.getElementById('sos-ve-intake-success');
  const formWrap = document.getElementById('sos-ve-intake-form-wrap');
  const statusEl = document.getElementById('sos-ve-intake-status');
  const submitBtn = form.querySelector('[type="submit"]');
  const relacionSelect = form.querySelector('#relacion');
  const prioridadSelect = form.querySelector('#prioridad');
  const emergencyNotice = document.getElementById('sos-ve-emergency-notice');
  const nomePacienteGroup = document.getElementById('nome-paciente-group');
  const nomePacienteInput = form.querySelector('#nome_paciente');
  const whatsappInput = form.querySelector('#whatsapp');
  const protocoloEl = document.getElementById('sos-ve-protocolo');
  const whatsappHelpLink = document.getElementById('sos-ve-whatsapp-help');
  const whatsappProtocolLink = document.getElementById('sos-ve-whatsapp-protocol');
  const copyProtocolBtn = document.getElementById('sos-ve-copy-protocol');
  const copyFeedbackEl = document.getElementById('sos-ve-copy-feedback');

  let currentProtocolo = null;
  let currentIntakeToken = null;
  let clientRequestId = crypto.randomUUID();
  let draftTimer = null;

  const MSG_FALLBACK = {
    'sosve.intake.validation.nome': {
      es: 'Ingrese su nombre completo.',
      pt: 'Informe seu nome completo.',
    },
    'sosve.intake.validation.email': {
      es: 'Ingrese un correo electrónico válido.',
      pt: 'Informe um e-mail válido.',
    },
    'sosve.intake.validation.whatsapp': {
      es: 'WhatsApp incompleto. Use operadora + 7 dígitos (ej.: 414 1234567).',
      pt: 'WhatsApp incompleto. Use operadora + 7 dígitos (ex.: 414 1234567).',
    },
    'sosve.intake.validation.relacion': {
      es: 'Seleccione su relación con el paciente.',
      pt: 'Selecione sua relação com o paciente.',
    },
    'sosve.intake.validation.nomePaciente': {
      es: 'Ingrese el nombre del paciente.',
      pt: 'Informe o nome do paciente.',
    },
    'sosve.intake.validation.edad': {
      es: 'La edad debe ser un número entre 0 y 120.',
      pt: 'A idade deve ser um número entre 0 e 120.',
    },
    'sosve.intake.validation.estado': {
      es: 'Seleccione el estado.',
      pt: 'Selecione o estado.',
    },
    'sosve.intake.validation.ciudad': {
      es: 'Ingrese la ciudad.',
      pt: 'Informe a cidade.',
    },
    'sosve.intake.validation.tipo': {
      es: 'Seleccione el tipo de atención.',
      pt: 'Selecione o tipo de atendimento.',
    },
    'sosve.intake.validation.prioridad': {
      es: 'Seleccione la urgencia percibida.',
      pt: 'Selecione a urgência percebida.',
    },
    'sosve.intake.validation.sintomas': {
      es: 'Describa síntomas o necesidad de atención.',
      pt: 'Descreva sintomas ou necessidade de atendimento.',
    },
    'sosve.intake.validation.consentimiento': {
      es: 'Debe aceptar el TCLE para continuar.',
      pt: 'É necessário aceitar o TCLE para continuar.',
    },
    'sosve.intake.validation.lgpd': {
      es: 'Debe autorizar el tratamiento de datos conforme a la Política de Privacidad.',
      pt: 'É necessário autorizar o tratamento de dados conforme a Política de Privacidade.',
    },
    'sosve.intake.errorPhone': {
      es: 'WhatsApp incompleto. Use operadora + 7 dígitos (ej.: 414 1234567).',
      pt: 'WhatsApp incompleto. Use operadora + 7 dígitos (ex.: 414 1234567).',
    },
    'sosve.intake.errorPrivacy': {
      es: 'Debe autorizar el tratamiento de datos conforme a la Política de Privacidad.',
      pt: 'É necessário autorizar o tratamento de dados conforme a Política de Privacidade.',
    },
    'sosve.intake.errorRateLimit': {
      es: 'Espere un momento antes de enviar otra solicitud.',
      pt: 'Aguarde um momento antes de enviar outra solicitação.',
    },
    'sosve.intake.error': {
      es: 'No se pudo enviar la solicitud. Intente de nuevo.',
      pt: 'Não foi possível enviar a solicitação. Tente novamente.',
    },
    'sosve.intake.errorNetwork': {
      es: 'Error de conexión. Verifique su internet e intente de nuevo.',
      pt: 'Erro de conexão. Verifique sua internet e tente novamente.',
    },
    'sosve.intake.sending': {
      es: 'Enviando solicitud…',
      pt: 'Enviando solicitação…',
    },
    'sosve.intake.success.copyDone': {
      es: 'Protocolo copiado al portapapeles.',
      pt: 'Protocolo copiado para a área de transferência.',
    },
    'sosve.intake.success.copyFailed': {
      es: 'No se pudo copiar. Anote su protocolo manualmente.',
      pt: 'Não foi possível copiar. Anote seu protocolo manualmente.',
    },
    'sosve.intake.whatsappHelpMsg': {
      es: 'Hola, envié mi solicitud SOS Venezuela (protocolo {protocolo}) y necesito ayuda con el registro',
      pt: 'Olá, enviei minha solicitação SOS Venezuela (protocolo {protocolo}) e preciso de ajuda com o cadastro',
    },
    'sosve.intake.whatsappProtocolMsg': {
      es: 'Mi protocolo SOS Venezuela es {protocolo}. Solicité atención médica/psicológica gratuita.',
      pt: 'Meu protocolo SOS Venezuela é {protocolo}. Solicitei atendimento médico/psicológico gratuito.',
    },
  };

  const formStartedAtInput = form.querySelector('#form_started_at');
  if (formStartedAtInput) {
    formStartedAtInput.value = String(Date.now());
  }

  function getLang() {
    return window.AcuraI18n?.getLang?.() || 'es';
  }

  function t(key) {
    if (window.AcuraI18n) {
      const translated = window.AcuraI18n.t(getLang(), key);
      if (translated && translated !== key) return translated;
    }
    const fb = MSG_FALLBACK[key];
    if (fb) return fb[getLang()] || fb.es;
    return MSG_FALLBACK[key]?.es || 'Revise este campo e intente de nuevo.';
  }

  function parseVenezuelaWhatsApp(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('58') && digits.length > 10) digits = digits.slice(2);
    while (digits.startsWith('0') && digits.length > 10) digits = digits.slice(1);
    if (digits.startsWith('58') && digits.length > 10) digits = digits.slice(2);
    if (digits.length < 10 || digits.length > 11) return null;
    const ddd = digits.length === 10 ? digits.slice(0, 3) : digits.slice(0, 4);
    const telefone = digits.slice(-7);
    if (telefone.length !== 7 || ddd.length < 3 || ddd.length > 4) return null;
    return { ddi: '58', ddd, telefone };
  }

  function buildUbicacion() {
    const ciudad = form.querySelector('#ciudad')?.value.trim() || '';
    const estadoSelect = form.querySelector('#estado');
    const estadoValue = estadoSelect?.value || '';
    const estadoLabel = estadoSelect?.selectedOptions?.[0]?.textContent?.trim() || estadoValue;
    if (!ciudad || !estadoValue) return '';
    return `${ciudad}, ${estadoLabel}`;
  }

  function setFieldError(fieldId, message) {
    const el = document.getElementById(`${fieldId}-error`);
    const input = form.querySelector(`#${fieldId}`);
    if (el) {
      el.textContent = message;
      el.hidden = !message;
    }
    if (input) input.classList.toggle('is-invalid', !!message);
  }

  function clearFieldErrors() {
    form.querySelectorAll('.form-field-error').forEach((el) => {
      el.hidden = true;
      el.textContent = '';
    });
    form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
  }

  function validateFormInline() {
    clearFieldErrors();
    const errors = [];

    const nome = form.querySelector('#nome')?.value.trim() || '';
    if (!nome) errors.push({ id: 'nome', msg: t('sosve.intake.validation.nome') });

    const email = form.querySelector('#email')?.value.trim() || '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ id: 'email', msg: t('sosve.intake.validation.email') });
    }

    const phone = parseVenezuelaWhatsApp(whatsappInput?.value || '');
    if (!phone) errors.push({ id: 'whatsapp', msg: t('sosve.intake.validation.whatsapp') });

    const relacion = relacionSelect?.value || '';
    if (!relacion) errors.push({ id: 'relacion', msg: t('sosve.intake.validation.relacion') });

    if (relacion && relacion !== 'paciente') {
      const nomePaciente = nomePacienteInput?.value.trim() || '';
      if (!nomePaciente) errors.push({ id: 'nome_paciente', msg: t('sosve.intake.validation.nomePaciente') });
    }

    const edadRaw = form.querySelector('#edad')?.value.trim() || '';
    if (edadRaw !== '') {
      const edad = Number(edadRaw);
      if (!Number.isInteger(edad) || edad < 0 || edad > 120) {
        errors.push({ id: 'edad', msg: t('sosve.intake.validation.edad') });
      }
    }

    const estado = form.querySelector('#estado')?.value || '';
    if (!estado) errors.push({ id: 'estado', msg: t('sosve.intake.validation.estado') });

    const ciudad = form.querySelector('#ciudad')?.value.trim() || '';
    if (!ciudad) errors.push({ id: 'ciudad', msg: t('sosve.intake.validation.ciudad') });

    const tipo = form.querySelector('#tipo_atencion')?.value || '';
    if (!tipo) errors.push({ id: 'tipo_atencion', msg: t('sosve.intake.validation.tipo') });

    const prioridad = prioridadSelect?.value || '';
    if (!prioridad) errors.push({ id: 'prioridad', msg: t('sosve.intake.validation.prioridad') });

    const sintomas = form.querySelector('#sintomas')?.value.trim() || '';
    if (!sintomas) errors.push({ id: 'sintomas', msg: t('sosve.intake.validation.sintomas') });

    const consentimiento = form.querySelector('#consentimiento')?.checked;
    if (!consentimiento) errors.push({ id: 'consentimiento', msg: t('sosve.intake.validation.consentimiento') });

    const lgpd = form.querySelector('#lgpd_privacidade')?.checked;
    if (!lgpd) errors.push({ id: 'lgpd_privacidade', msg: t('sosve.intake.validation.lgpd') });

    errors.forEach(({ id, msg }) => setFieldError(id, msg));

    if (errors.length) {
      const first = form.querySelector(`#${errors[0].id}`);
      first?.focus();
      return null;
    }

    return { phone, ubicacion: buildUbicacion() };
  }

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

  const toggleNomePaciente = () => {
    const relacion = relacionSelect?.value || '';
    const show = relacion !== '' && relacion !== 'paciente';
    if (nomePacienteGroup) nomePacienteGroup.hidden = !show;
    if (nomePacienteInput) {
      if (!show) nomePacienteInput.value = '';
    }
    if (!show) setFieldError('nome_paciente', '');
  };

  const toggleEmergencyNotice = () => {
    if (!emergencyNotice || !prioridadSelect) return;
    emergencyNotice.hidden = prioridadSelect.value !== 'emergencia';
  };

  function collectDraft() {
    return {
      nome: form.querySelector('#nome')?.value || '',
      email: form.querySelector('#email')?.value || '',
      whatsapp: whatsappInput?.value || '',
      relacion: relacionSelect?.value || '',
      nome_paciente: nomePacienteInput?.value || '',
      edad: form.querySelector('#edad')?.value || '',
      estado: form.querySelector('#estado')?.value || '',
      ciudad: form.querySelector('#ciudad')?.value || '',
      tipo_atencion: form.querySelector('#tipo_atencion')?.value || '',
      prioridad: prioridadSelect?.value || '',
      sintomas: form.querySelector('#sintomas')?.value || '',
      observaciones: form.querySelector('#observaciones')?.value || '',
    };
  }

  function applyDraft(data) {
    if (!data || typeof data !== 'object') return;
    if (data.nome != null) form.querySelector('#nome').value = data.nome;
    if (data.email != null) form.querySelector('#email').value = data.email;
    if (data.whatsapp != null && whatsappInput) whatsappInput.value = data.whatsapp;
    if (data.relacion != null && relacionSelect) relacionSelect.value = data.relacion;
    if (data.nome_paciente != null && nomePacienteInput) nomePacienteInput.value = data.nome_paciente;
    if (data.edad != null) form.querySelector('#edad').value = data.edad;
    if (data.estado != null) form.querySelector('#estado').value = data.estado;
    if (data.ciudad != null) form.querySelector('#ciudad').value = data.ciudad;
    if (data.tipo_atencion != null) form.querySelector('#tipo_atencion').value = data.tipo_atencion;
    if (data.prioridad != null && prioridadSelect) prioridadSelect.value = data.prioridad;
    if (data.sintomas != null) form.querySelector('#sintomas').value = data.sintomas;
    if (data.observaciones != null) form.querySelector('#observaciones').value = data.observaciones;
    toggleNomePaciente();
    toggleEmergencyNotice();
  }

  function saveDraftDebounced() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(collectDraft()));
      } catch { /* quota / private mode */ }
    }, DRAFT_DEBOUNCE_MS);
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch { /* ignore */ }
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      applyDraft(JSON.parse(raw));
    } catch { /* ignore corrupt draft */ }
  }

  if (relacionSelect) {
    relacionSelect.addEventListener('change', () => {
      toggleNomePaciente();
      saveDraftDebounced();
    });
    toggleNomePaciente();
  }

  if (prioridadSelect) {
    prioridadSelect.addEventListener('change', () => {
      toggleEmergencyNotice();
      saveDraftDebounced();
    });
    toggleEmergencyNotice();
  }

  form.addEventListener('input', saveDraftDebounced);
  form.addEventListener('change', saveDraftDebounced);
  restoreDraft();

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
    if (field) field.addEventListener('focus', () => setIntakeProgress(2));
  });

  async function resolveWhatsappNumber() {
    let number = '5531971720053';
    try {
      const infoRes = await fetch('/api/sos-venezuela/public-info');
      if (infoRes.ok) {
        const info = await infoRes.json();
        if (info?.whatsapp?.number) number = info.whatsapp.number;
      }
    } catch { /* fallback */ }
    return String(number).replace(/\D/g, '');
  }

  function buildWaLink(number, message) {
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  }

  async function setupWhatsappLinks(protocolo) {
    const number = await resolveWhatsappNumber();
    if (whatsappHelpLink) {
      const msg = t('sosve.intake.whatsappHelpMsg').replace('{protocolo}', protocolo);
      whatsappHelpLink.href = buildWaLink(number, msg);
    }
    if (whatsappProtocolLink) {
      const msg = t('sosve.intake.whatsappProtocolMsg').replace('{protocolo}', protocolo);
      whatsappProtocolLink.href = buildWaLink(number, msg);
    }
  }

  function showCopyFeedback(success) {
    if (!copyFeedbackEl) return;
    copyFeedbackEl.hidden = false;
    copyFeedbackEl.textContent = t(success ? 'sosve.intake.success.copyDone' : 'sosve.intake.success.copyFailed');
    copyFeedbackEl.className = `intake-copy-feedback ${success ? 'is-success' : 'is-error'}`;
  }

  async function copyProtocolToClipboard(protocolo) {
    if (!protocolo) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(protocolo);
        return true;
      }
    } catch { /* fallback */ }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = protocolo;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }

  function trackIntakeEvent(event) {
    if (!currentProtocolo || !currentIntakeToken || !event) return;
    fetch('/api/sos-venezuela/intake/' + encodeURIComponent(currentProtocolo) + '/event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Intake-Token': currentIntakeToken,
      },
      body: JSON.stringify({ event }),
      keepalive: true,
    }).catch(() => {});
  }

  function bindSuccessTracking() {
    document.querySelectorAll('[data-intake-event]').forEach((el) => {
      el.addEventListener('click', () => trackIntakeEvent(el.dataset.intakeEvent));
    });
  }

  if (copyProtocolBtn) {
    copyProtocolBtn.addEventListener('click', async () => {
      showCopyFeedback(await copyProtocolToClipboard(currentProtocolo));
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearStatus();
    toggleNomePaciente();

    const validated = validateFormInline();
    if (!validated) return;

    const { phone } = validated;

    if (submitBtn) submitBtn.disabled = true;
    showStatus('info', 'sosve.intake.sending');

    const honeypot = form.querySelector('#website');
    if (honeypot) honeypot.value = '';

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
          whatsapp: whatsappInput?.value.trim() || '',
          ddi: phone.ddi,
          ddd: phone.ddd,
          telefone: phone.telefone,
          relacion: relacionSelect?.value || '',
          nome_paciente: form.querySelector('#nome_paciente')?.value.trim() || '',
          edad: form.querySelector('#edad')?.value.trim() || '',
          estado: form.querySelector('#estado')?.value || '',
          ciudad: form.querySelector('#ciudad')?.value.trim() || '',
          ubicacion: buildUbicacion(),
          tipo_atencion: form.querySelector('#tipo_atencion')?.value || '',
          prioridad: prioridadSelect?.value || '',
          sintomas: form.querySelector('#sintomas')?.value.trim() || '',
          observaciones: form.querySelector('#observaciones')?.value.trim() || '',
          consentimiento: form.querySelector('#consentimiento')?.checked || false,
          lgpd_privacidade: form.querySelector('#lgpd_privacidade')?.checked || false,
          website: form.querySelector('#website')?.value || '',
          form_started_at: form.querySelector('#form_started_at')?.value || '',
          client_request_id: clientRequestId,
          referral_source: window.SosVenezuelaPublic?.getStoredReferral?.() || '',
        }),
      });

      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok && data.protocolo) {
        currentProtocolo = data.protocolo;
        currentIntakeToken = data.intakeToken || null;
        if (data.intakeToken) {
          try {
            sessionStorage.setItem(INTAKE_TOKEN_STORAGE_KEY, data.intakeToken);
          } catch { /* private mode */ }
        }
        clearDraft();
        if (protocoloEl) protocoloEl.textContent = data.protocolo;
        if (copyFeedbackEl) {
          copyFeedbackEl.hidden = true;
          copyFeedbackEl.textContent = '';
        }
        await setupWhatsappLinks(data.protocolo);
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
        setFieldError('lgpd_privacidade', t('sosve.intake.errorPrivacy'));
        form.querySelector('#lgpd_privacidade')?.focus();
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
        setFieldError('whatsapp', t('sosve.intake.errorPhone'));
        whatsappInput?.focus();
        return;
      }

      showStatus('error', 'sosve.intake.error');
    } catch {
      showStatus('error', 'sosve.intake.errorNetwork');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  document.addEventListener('acura:langchange', () => {
    if (currentProtocolo) setupWhatsappLinks(currentProtocolo);
  });
})();
