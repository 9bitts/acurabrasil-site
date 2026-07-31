(function () {
  const form = document.getElementById('mc-eft-form');
  const statusEl = document.getElementById('mc-eft-form-status');
  const whatsappInput = document.getElementById('mc-whatsapp');
  const termDialog = document.getElementById('mc-term-dialog');
  const termTitle = document.getElementById('mc-term-dialog-title');
  const termBody = document.getElementById('mc-term-dialog-body');

  const TERMS = {
    confidencialidade: {
      title: 'Termo de Confidencialidade e Proteção de Conteúdo',
      html: `
        <p><strong>Masterclass EFT Avatar</strong></p>
        <p>Ao assinalar a caixa de aceite e acessar o conteúdo da Masterclass EFT Avatar, você (doravante “Aluno” ou “Participante”) declara estar ciente e de acordo com as seguintes condições:</p>
        <ol>
          <li><strong>Propriedade intelectual.</strong> Todo o material, metodologias, materiais de apoio, técnicas de EFT (Emotional Freedom Techniques) adaptadas, áudios, vídeos e documentos apresentados nesta masterclass são de propriedade exclusiva da organização do evento e de seus parceiros autorizados.</li>
          <li><strong>Sigilo e não compartilhamento.</strong> É expressamente proibido gravar (por tela, áudio ou câmera externa), fotografar, baixar (salvo materiais explicitamente liberados para download), reproduzir, distribuir, ceder ou compartilhar, no todo ou em parte, os conteúdos exibidos durante a masterclass, sem autorização prévia por escrito.</li>
          <li><strong>Uso pessoal.</strong> O acesso concedido é pessoal e intransferível, destinado exclusivamente ao seu aprendizado individual.</li>
          <li><strong>Sanções.</strong> A violação deste termo sujeita o infrator às medidas civis e criminais cabíveis, inclusive nos termos da Lei nº 9.610/1998 (direitos autorais) e da legislação de propriedade intelectual aplicável.</li>
        </ol>
        <p>Versão 2026-07-eft · ACURA Brasil / Masterclass EFT Avatar.</p>
      `,
    },
    imagem: {
      title: 'Termo de Autorização de Uso de Imagem e Voz',
      html: `
        <p><strong>Masterclass EFT Avatar</strong></p>
        <p>Ao aceitar este termo, você autoriza expressamente o uso da sua imagem e áudio sob as seguintes condições:</p>
        <ol>
          <li><strong>Cessão de direitos.</strong> Autorizo, a título gratuito e de forma irrevogável, o uso do meu nome, imagem, voz e eventuais depoimentos capturados durante a Masterclass EFT Avatar (incluindo interações ao vivo, chat, áudios enviados ou vídeos com câmera aberta).</li>
          <li><strong>Finalidade.</strong> Esta autorização destina-se exclusivamente à divulgação, promoção, publicação em redes sociais, websites, anúncios, novos cursos, materiais institucionais ou publicitários ligados ao projeto EFT Avatar e aos seus organizadores.</li>
          <li><strong>Abrangência.</strong> A autorização é concedida sem limite de tempo e sem restrição de território, sem que nada seja devido a título de direitos autorais ou de imagem.</li>
          <li><strong>Respeito à dignidade.</strong> O material capturado não será utilizado de forma a desonrar ou prejudicar a imagem pública do participante.</li>
        </ol>
        <p>Versão 2026-07-eft · ACURA Brasil / Masterclass EFT Avatar.</p>
      `,
    },
  };

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

  function openTerm(key) {
    const term = TERMS[key];
    if (!term || !termDialog || !termTitle || !termBody) return;
    termTitle.textContent = term.title;
    termBody.innerHTML = term.html;
    if (typeof termDialog.showModal === 'function') {
      termDialog.showModal();
    } else {
      termDialog.setAttribute('open', 'open');
    }
  }

  function closeTerm() {
    if (!termDialog) return;
    if (typeof termDialog.close === 'function') {
      termDialog.close();
    } else {
      termDialog.removeAttribute('open');
    }
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

  document.querySelectorAll('[data-mc-term]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openTerm(btn.getAttribute('data-mc-term'));
    });
  });

  document.getElementById('mc-term-dialog-close')?.addEventListener('click', closeTerm);
  document.getElementById('mc-term-dialog-ok')?.addEventListener('click', closeTerm);
  termDialog?.addEventListener('click', (e) => {
    if (e.target === termDialog) closeTerm();
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
      profissao: String(fd.get('profissao') || '').trim(),
      aluno_meire: String(fd.get('aluno_meire') || '').trim(),
      relacao: String(fd.get('relacao') || '').trim(),
      codigo_carteirinha: String(fd.get('codigo_carteirinha') || '').trim(),
      mensagem: String(fd.get('mensagem') || '').trim(),
      privacidade: fd.get('privacidade') === 'on',
      termo_confidencialidade: fd.get('termo_confidencialidade') === 'on',
      termo_imagem: fd.get('termo_imagem') === 'on',
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
    if (!payload.profissao || payload.profissao.length < 2) {
      showStatus('Informe sua profissão.', 'error');
      return;
    }
    if (!payload.aluno_meire) {
      showStatus('Informe se você é aluno(a) da Meire Yamaguchi.', 'error');
      return;
    }
    if (!payload.relacao) {
      showStatus('Selecione sua relação com a ACURA Brasil.', 'error');
      return;
    }
    if (!payload.codigo_carteirinha || payload.codigo_carteirinha.length < 3) {
      showStatus('Informe o código da carteirinha ACURA ou EFTAVATAR.', 'error');
      return;
    }
    if (!payload.privacidade) {
      showStatus('É necessário autorizar o uso dos dados para processar a inscrição.', 'error');
      return;
    }
    if (!payload.termo_confidencialidade) {
      showStatus('É necessário aceitar o Termo de Confidencialidade.', 'error');
      return;
    }
    if (!payload.termo_imagem) {
      showStatus('É necessário aceitar o Termo de Autorização de Uso de Imagem e Voz.', 'error');
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
          profissao_required: 'Informe sua profissão.',
          aluno_meire_required: 'Informe se você é aluno(a) da Meire Yamaguchi.',
          relacao_required: 'Selecione sua relação com a ACURA Brasil.',
          codigo_required: 'Informe o código da carteirinha ACURA ou EFTAVATAR.',
          privacidade_required: 'É necessário autorizar o uso dos dados.',
          termo_confidencialidade_required: 'É necessário aceitar o Termo de Confidencialidade.',
          termo_imagem_required: 'É necessário aceitar o Termo de Autorização de Uso de Imagem e Voz.',
        };
        showStatus(map[data.error] || 'Não foi possível concluir a inscrição. Tente novamente.', 'error');
        return;
      }

      form.reset();
      const msg = data.needsVolunteerReview
        ? 'Inscrição recebida! Como você deseja se voluntariar, a equipe da ACURA Brasil analisará a demanda. Após a confirmação, você receberá o link do grupo de WhatsApp com as orientações.'
        : 'Inscrição recebida! Após a confirmação da equipe, você receberá o link do grupo de WhatsApp com as orientações de acesso.';
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
