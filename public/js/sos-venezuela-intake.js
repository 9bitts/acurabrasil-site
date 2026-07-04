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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearStatus();
    toggleNomePaciente();

    if (!form.checkValidity()) {
      form.reportValidity();
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
          ddi: form.querySelector('#ddi')?.value.trim() || '',
          ddd: form.querySelector('#ddd')?.value.trim() || '',
          telefone: form.querySelector('#telefone')?.value.trim() || '',
          relacion: relacionSelect?.value || '',
          nome_paciente: form.querySelector('#nome_paciente')?.value.trim() || '',
          edad: form.querySelector('#edad')?.value.trim() || '',
          ubicacion: form.querySelector('#ubicacion')?.value.trim() || '',
          tipo_atencion: form.querySelector('#tipo_atencion')?.value || '',
          prioridad: form.querySelector('#prioridad')?.value || '',
          sintomas: form.querySelector('#sintomas')?.value.trim() || '',
          observaciones: form.querySelector('#observaciones')?.value.trim() || '',
          consentimiento: form.querySelector('#consentimiento')?.checked || false,
          website: form.querySelector('#website')?.value || '',
        }),
      });

      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok && data.protocolo) {
        if (protocoloEl) protocoloEl.textContent = data.protocolo;
        if (whatsappHelpLink) {
          const msg = t('sosve.intake.whatsappHelpMsg').replace('{protocolo}', data.protocolo);
          whatsappHelpLink.href = `https://wa.me/5531971720053?text=${encodeURIComponent(msg)}`;
        }
        if (formWrap) formWrap.hidden = true;
        if (successBlock) {
          successBlock.hidden = false;
          successBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      if (res.status === 429) {
        showStatus('error', 'sosve.intake.errorRateLimit');
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
