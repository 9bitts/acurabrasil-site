(function () {
  const form = document.getElementById('mc-eft-form');
  const statusEl = document.getElementById('mc-eft-form-status');
  const whatsappInput = document.getElementById('mc-whatsapp');

  function showStatus(message, type) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className = 'form-status ' + (type || 'info');
  }

  function maskWhatsApp(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits.length ? `(${digits}` : '';
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  if (whatsappInput) {
    whatsappInput.addEventListener('input', () => {
      const start = whatsappInput.selectionStart;
      const before = whatsappInput.value;
      whatsappInput.value = maskWhatsApp(whatsappInput.value);
      if (document.activeElement === whatsappInput && typeof start === 'number') {
        const diff = whatsappInput.value.length - before.length;
        whatsappInput.setSelectionRange(start + diff, start + diff);
      }
    });
  }

  document.querySelectorAll('.mc-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('aria-controls');
      document.querySelectorAll('.mc-tab').forEach((t) => t.setAttribute('aria-selected', 'false'));
      document.querySelectorAll('.mc-schedule').forEach((panel) => {
        panel.hidden = true;
      });
      tab.setAttribute('aria-selected', 'true');
      const panel = document.getElementById(target);
      if (panel) panel.hidden = false;
    });
  });

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('[type="submit"]');
    const fd = new FormData(form);

    const payload = {
      nome: String(fd.get('nome') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      whatsapp: String(fd.get('whatsapp') || '').trim(),
      relacao: String(fd.get('relacao') || '').trim(),
      mensagem: String(fd.get('mensagem') || '').trim(),
      privacidade: fd.get('privacidade') === 'on',
      marketing: fd.get('marketing') === 'on',
      website: String(fd.get('website') || ''),
    };

    if (!payload.nome || payload.nome.length < 2) {
      showStatus('Informe seu nome completo.', 'error');
      return;
    }
    if (!payload.email) {
      showStatus('Informe um e-mail válido.', 'error');
      return;
    }
    if (!payload.whatsapp || payload.whatsapp.replace(/\D/g, '').length < 10) {
      showStatus('Informe um WhatsApp com DDD válido.', 'error');
      return;
    }
    if (!payload.relacao) {
      showStatus('Selecione sua relação com a ACURA Brasil.', 'error');
      return;
    }
    if (!payload.privacidade) {
      showStatus('É necessário autorizar o uso dos dados para processar a inscrição.', 'error');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando…';
    }
    showStatus('Enviando sua inscrição…', 'info');

    try {
      const res = await fetch('/api/masterclass-eft/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        showStatus('Este e-mail já possui inscrição nesta formação. Em caso de dúvida, fale com a equipe da ACURA Brasil.', 'error');
        return;
      }
      if (!res.ok || !data.ok) {
        const map = {
          rate_limit: 'Aguarde um momento e tente novamente.',
          nome_required: 'Informe seu nome completo.',
          email_invalid: 'Informe um e-mail válido.',
          whatsapp_invalid: 'Informe um WhatsApp com DDD válido.',
          relacao_required: 'Selecione sua relação com a ACURA Brasil.',
          privacidade_required: 'É necessário autorizar o uso dos dados.',
        };
        showStatus(map[data.error] || 'Não foi possível concluir a inscrição. Tente novamente.', 'error');
        return;
      }

      form.reset();
      const msg = data.needsVolunteerReview
        ? 'Inscrição recebida! Como você deseja se voluntariar, a equipe da ACURA Brasil analisará a demanda e entrará em contato com as orientações.'
        : 'Inscrição confirmada! Em breve você receberá as orientações de acesso por e-mail ou WhatsApp.';
      showStatus(msg, 'success');

      if (window.AcuraAnalytics && typeof window.AcuraAnalytics.trackEvent === 'function') {
        window.AcuraAnalytics.trackEvent('masterclass_eft_inscricao', { relacao: payload.relacao });
      }
    } catch {
      showStatus('Erro de conexão. Verifique sua internet e tente novamente.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirmar minha inscrição gratuita';
      }
    }
  });
})();
