(function () {
  'use strict';

  var CONFIG = {
    pixKey: '30.350.850/0001-80',
    pixName: 'ACURABRASIL',
    pixCity: 'BELO HORIZONTE',
    angelRegisterUrl: 'https://app.doctor8.org/register/angel',
  };

  var paypalState = {
    clientId: '',
    enabled: false,
    sdkIntent: null,
    onceButtons: null,
    monthlyButtons: null,
  };

  var AMOUNTS = [30, 50, 100, 250, 500, 1000];
  var state = {
    amount: 50,
    type: 'unica',
    cause: 'humanitaria',
    customAmount: '',
  };

  function crc16(payload) {
    var polynomial = 0x1021;
    var crc = 0xffff;
    for (var i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (var j = 0; j < 8; j++) {
        if (crc & 0x8000) crc = (crc << 1) ^ polynomial;
        else crc <<= 1;
        crc &= 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  function emv(id, value) {
    var len = String(value.length).padStart(2, '0');
    return id + len + value;
  }

  function generatePixPayload(amount) {
    var key = CONFIG.pixKey.replace(/\D/g, '');
    var merchantAccount = emv('00', 'br.gov.bcb.pix') + emv('01', key);
    var payload = emv('00', '01') + emv('26', merchantAccount);
    payload += emv('52', '0000');
    payload += emv('53', '986');
    if (amount && amount > 0) {
      payload += emv('54', amount.toFixed(2));
    }
    payload += emv('58', 'BR');
    payload += emv('59', CONFIG.pixName.substring(0, 25));
    payload += emv('60', CONFIG.pixCity.substring(0, 15));
    payload += emv('62', emv('05', '***'));
    payload += '6304';
    return payload + crc16(payload);
  }

  function getActiveAmount() {
    if (state.customAmount) {
      var custom = parseFloat(String(state.customAmount).replace(',', '.'));
      if (!isNaN(custom) && custom > 0) return custom;
    }
    return state.amount;
  }

  function updateQr() {
    var canvas = document.getElementById('pix-qr');
    if (!canvas || !window.QRCode) return;
    var amount = getActiveAmount();
    var payload = generatePixPayload(amount);
    window.QRCode.toCanvas(canvas, payload, { width: 220, margin: 1 }, function (err) {
      if (err) console.error('Pix QR error:', err);
    });
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'QR Code Pix R$ ' + amount.toFixed(2));
  }

  function updateAmountDisplay() {
    var amount = getActiveAmount();
    var display = document.getElementById('pix-amount-display');
    if (display) display.textContent = 'R$ ' + amount.toFixed(2).replace('.', ',');
    updateQr();
    updateBadgePreview(amount);
    schedulePaypalRender();
  }

  var paypalRenderTimer = null;
  function schedulePaypalRender() {
    if (paypalRenderTimer) clearTimeout(paypalRenderTimer);
    paypalRenderTimer = setTimeout(function () {
      renderPaypalButtons();
    }, 350);
  }

  function getBadgeForAmount(amount, type) {
    if (type === 'voluntario') {
      return { id: 'anjo', nameKey: 'doacao.badge.anjo.name', descKey: 'doacao.badge.anjo.desc' };
    }
    if (type === 'mensal' && amount >= 250) {
      return { id: 'patrono', nameKey: 'doacao.badge.patrono.name', descKey: 'doacao.badge.patrono.desc' };
    }
    if (type === 'mensal' && amount >= 100) {
      return { id: 'benemerito', nameKey: 'doacao.badge.benemerito.name', descKey: 'doacao.badge.benemerito.desc' };
    }
    if (type === 'mensal' && amount >= 30) {
      return { id: 'protetor', nameKey: 'doacao.badge.protetor.name', descKey: 'doacao.badge.protetor.desc' };
    }
    if (amount >= 1000) {
      return { id: 'patrono', nameKey: 'doacao.badge.patrono.name', descKey: 'doacao.badge.patrono.desc' };
    }
    if (amount >= 500) {
      return { id: 'benemerito', nameKey: 'doacao.badge.benemerito.name', descKey: 'doacao.badge.benemerito.desc' };
    }
    if (amount >= 100) {
      return { id: 'protetor', nameKey: 'doacao.badge.protetor.name', descKey: 'doacao.badge.protetor.desc' };
    }
    if (amount >= 30) {
      return { id: 'guardiao', nameKey: 'doacao.badge.guardiao.name', descKey: 'doacao.badge.guardiao.desc' };
    }
    return { id: 'amigo', nameKey: 'doacao.badge.amigo.name', descKey: 'doacao.badge.amigo.desc' };
  }

  function t(key) {
    if (window.ACURA_I18N && window.AcuraI18n) {
      var lang = window.AcuraI18n.getLang();
      var dict = window.ACURA_I18N[lang] || window.ACURA_I18N.es;
      return dict[key] || key;
    }
    return key;
  }

  function updateBadgePreview(amount) {
    var preview = document.getElementById('badge-preview');
    if (!preview) return;
    var badge = getBadgeForAmount(amount, state.type === 'mensal' ? 'mensal' : 'unica');
    if (state.cause === 'pesquisa' && amount >= 200) {
      badge = { id: 'mecenas', nameKey: 'doacao.badge.mecenas.name', descKey: 'doacao.badge.mecenas.desc' };
    }
    preview.dataset.badge = badge.id;
    var selo = preview.querySelector('.doacao-selo');
    if (selo) {
      selo.className = 'doacao-selo doacao-selo--' + badge.id;
    }
    var nameEl = preview.querySelector('.badge-preview-name');
    var descEl = preview.querySelector('.badge-preview-desc');
    if (nameEl) nameEl.textContent = t(badge.nameKey);
    if (descEl) descEl.textContent = t(badge.descKey);
  }

  function copyPixKey() {
    var key = CONFIG.pixKey;
    var feedback = document.getElementById('pix-copy-feedback');
    function showOk() {
      if (feedback) {
        feedback.hidden = false;
        setTimeout(function () { feedback.hidden = true; }, 2500);
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(key).then(showOk).catch(function () {
        fallbackCopy(key, showOk);
      });
    } else {
      fallbackCopy(key, showOk);
    }
  }

  function fallbackCopy(text, cb) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      if (cb) cb();
    } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  function bindAmountButtons() {
    document.querySelectorAll('[data-amount]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.customAmount = '';
        state.amount = parseInt(btn.dataset.amount, 10);
        var customInput = document.getElementById('custom-amount');
        if (customInput) customInput.value = '';
        document.querySelectorAll('[data-amount]').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        updateAmountDisplay();
        updateImpactDisplay(state.amount, btn);
        trackDonationAmount(state.amount);
      });
    });
  }

  function updateImpactDisplay(amount, btn) {
    var el = document.getElementById('doacao-impact-display');
    if (!el || !window.AcuraI18n) return;
    var key = (btn && btn.getAttribute('data-impact-key')) || 'doacao.impact.custom';
    if (amount && [30, 50, 100, 250, 500, 1000].indexOf(amount) !== -1) {
      key = 'doacao.impact.' + amount;
    }
    el.textContent = window.AcuraI18n.t(window.AcuraI18n.getLang(), key);
    el.setAttribute('data-i18n', key);
  }

  function trackDonationAmount(amount) {
    document.dispatchEvent(
      new CustomEvent('acura:analytics', {
        detail: { event: 'doacao_valor_selecionado', params: { value: amount } },
      })
    );
  }

  function bindTypeTabs() {
    document.querySelectorAll('[data-donation-type]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        state.type = tab.dataset.donationType;
        document.querySelectorAll('[data-donation-type]').forEach(function (t) {
          t.classList.toggle('active', t === tab);
        });
        document.querySelectorAll('[data-panel-type]').forEach(function (panel) {
          panel.hidden = panel.dataset.panelType !== state.type;
        });
        updateBadgePreview(getActiveAmount());
        renderPaypalButtons();
      });
    });
  }

  function bindCauseTabs() {
    document.querySelectorAll('[data-cause]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        state.cause = tab.dataset.cause;
        document.querySelectorAll('[data-cause]').forEach(function (t) {
          t.classList.toggle('active', t === tab);
        });
        updateBadgePreview(getActiveAmount());
      });
    });
  }

  function bindCustomAmount() {
    var input = document.getElementById('custom-amount');
    if (!input) return;
    input.addEventListener('input', function () {
      state.customAmount = input.value;
      document.querySelectorAll('[data-amount]').forEach(function (b) {
        b.classList.remove('active');
      });
      updateAmountDisplay();
    });
  }

  function bindCopyPix() {
    var btn = document.getElementById('copy-pix-key');
    if (btn) btn.addEventListener('click', copyPixKey);
    var btnMonthly = document.getElementById('copy-pix-key-monthly');
    if (btnMonthly) btnMonthly.addEventListener('click', copyPixKey);
  }

  function bindRegisterForm() {
    var form = document.getElementById('doacao-register-form');
    if (!form) return;
    var submitBtn = form.querySelector('[type="submit"]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = document.getElementById('doacao-form-status');

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      if (status) {
        status.hidden = false;
        status.className = 'form-status info';
        status.textContent = t('contato.form.sending') || 'Enviando...';
      }

      var fd = new FormData(form);
      var amount = parseFloat(String(fd.get('valor') || '0').replace(',', '.')) || getActiveAmount();
      var tipo = fd.get('tipo_doacao') || state.type;
      var badge = getBadgeForAmount(amount, tipo === 'voluntario' ? 'voluntario' : tipo);
      if (fd.get('destino') === 'pesquisa' && amount >= 200) {
        badge = { id: 'mecenas', nameKey: 'doacao.badge.mecenas.name', descKey: 'doacao.badge.mecenas.desc' };
      }

      var body = {
        nome: String(fd.get('nome') || '').trim(),
        email: String(fd.get('email') || '').trim(),
        ddi: String(fd.get('ddi') || '').trim(),
        ddd: String(fd.get('ddd') || '').trim(),
        telefone: String(fd.get('telefone') || '').trim(),
        assunto: 'doacao',
        privacidade: form.querySelector('#doacao-privacidade')?.checked || false,
        mensagem: [
          'Tipo: ' + tipo,
          'Destino: ' + (fd.get('destino') || state.cause),
          'Valor: R$ ' + amount.toFixed(2),
          'Selo: ' + badge.id,
          'Comprovante/ref: ' + (fd.get('comprovante') || 'não informado'),
          '',
          String(fd.get('mensagem') || '').trim(),
        ].join('\n'),
        website: fd.get('website') || '',
      };

      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; }); })
        .then(function (result) {
          if (!status) return;
          status.hidden = false;
          if (result.ok && result.data.ok) {
            status.className = 'form-status success';
            status.textContent = t('doacao.form.success');
            document.dispatchEvent(
              new CustomEvent('acura:analytics', { detail: { event: 'formulario_contato_enviado', params: { form: 'doacao' } } })
            );
            try {
              localStorage.setItem('acura.badge', JSON.stringify({ id: badge.id, at: Date.now() }));
            } catch (err) { /* ignore */ }
            showEarnedBadge(badge);
            form.reset();
            var ddiInput = form.querySelector('[name="ddi"]');
            if (ddiInput) ddiInput.value = '+55';
            return;
          }
          if (result.status === 429) {
            status.className = 'form-status error';
            status.textContent = t('contato.form.errorRateLimit');
            return;
          }
          if (result.status === 400 && result.data.error === 'privacidade_required') {
            status.className = 'form-status error';
            status.textContent = t('contato.form.errorPrivacy');
            return;
          }
          status.className = 'form-status error';
          status.textContent = t('doacao.form.error');
        })
        .catch(function () {
          if (status) {
            status.hidden = false;
            status.className = 'form-status error';
            status.textContent = t('doacao.form.error');
          }
        })
        .finally(function () {
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  function showEarnedBadge(badge) {
    var earned = document.getElementById('earned-badge');
    if (!earned) return;
    earned.hidden = false;
    earned.dataset.badge = badge.id;
    var nameEl = earned.querySelector('.earned-badge-name');
    var descEl = earned.querySelector('.earned-badge-desc');
    if (nameEl) nameEl.textContent = t(badge.nameKey);
    if (descEl) descEl.textContent = t(badge.descKey);
    earned.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function getCauseLabel() {
    if (state.cause === 'pesquisa') {
      return t('doacao.cause.research');
    }
    return t('doacao.cause.humanitarian');
  }

  function loadPaypalSdk(intent) {
    if (!paypalState.clientId) {
      return Promise.reject(new Error('no client id'));
    }
    if (paypalState.sdkIntent === intent && window.paypal) {
      return Promise.resolve();
    }

    return new Promise(function (resolve, reject) {
      var existing = document.getElementById('paypal-sdk');
      if (existing) existing.remove();
      delete window.paypal;
      paypalState.sdkIntent = null;
      paypalState.onceButtons = null;
      paypalState.monthlyButtons = null;

      var script = document.createElement('script');
      script.id = 'paypal-sdk';
      // SRI não se aplica: URL gerada dinamicamente com client-id, intent e vault na query string.
      var url =
        'https://www.paypal.com/sdk/js?client-id=' +
        encodeURIComponent(paypalState.clientId) +
        '&currency=BRL&components=buttons&disable-funding=credit';
      if (intent === 'subscription') {
        url += '&vault=true&intent=subscription';
      }
      script.src = url;
      script.onload = function () {
        paypalState.sdkIntent = intent;
        resolve();
      };
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  function closePaypalButtons() {
    if (paypalState.onceButtons && paypalState.onceButtons.close) {
      try { paypalState.onceButtons.close(); } catch (e) { /* ignore */ }
    }
    if (paypalState.monthlyButtons && paypalState.monthlyButtons.close) {
      try { paypalState.monthlyButtons.close(); } catch (e) { /* ignore */ }
    }
    paypalState.onceButtons = null;
    paypalState.monthlyButtons = null;
  }

  function showPaypalUnavailable(which) {
    var container = document.getElementById(which === 'monthly' ? 'paypal-monthly-container' : 'paypal-once-container');
    var msg = document.getElementById(which === 'monthly' ? 'paypal-monthly-unavailable' : 'paypal-once-unavailable');
    if (container) container.innerHTML = '';
    if (msg) msg.hidden = false;
  }

  function hidePaypalUnavailable() {
    ['paypal-once-unavailable', 'paypal-monthly-unavailable'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
  }

  function showPaypalSuccess(kind, detail) {
    var el = document.getElementById(kind === 'monthly' ? 'paypal-monthly-success' : 'paypal-once-success');
    if (!el) return;
    el.hidden = false;
    el.textContent =
      kind === 'monthly'
        ? t('doacao.paypal.successMonthly')
        : t('doacao.paypal.successOnce').replace('{id}', detail || '');
    var register = document.getElementById('registrar');
    if (register) register.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderPaypalOnce() {
    var container = document.getElementById('paypal-once-container');
    if (!container || !window.paypal || state.type !== 'unica') return;

    closePaypalButtons();
    container.innerHTML = '';
    var amount = getActiveAmount();

    paypalState.onceButtons = window.paypal.Buttons({
      style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'donate' },
      createOrder: function (data, actions) {
        return actions.order.create({
          purchase_units: [
            {
              amount: { currency_code: 'BRL', value: amount.toFixed(2) },
              description: 'Doação ACURABRASIL — ' + getCauseLabel(),
              custom_id: 'doacao-' + state.cause,
            },
          ],
        });
      },
      onApprove: function (data, actions) {
        document.dispatchEvent(
          new CustomEvent('acura:analytics', { detail: { event: 'doacao_paypal_clicada', params: { type: 'once' } } })
        );
        return actions.order.capture().then(function (details) {
          var id = details.id || data.orderID || '';
          showPaypalSuccess('once', id);
        });
      },
      onError: function (err) {
        console.error('PayPal once error:', err);
      },
    });

    if (paypalState.onceButtons.isEligible()) {
      return paypalState.onceButtons.render('#paypal-once-container');
    }
    showPaypalUnavailable('once');
  }

  function renderPaypalMonthly() {
    var container = document.getElementById('paypal-monthly-container');
    if (!container || !window.paypal || state.type !== 'mensal') return;

    closePaypalButtons();
    container.innerHTML = '';
    var amount = getActiveAmount();

    paypalState.monthlyButtons = window.paypal.Buttons({
      style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'subscribe' },
      createSubscription: function (data, actions) {
        return fetch('/api/paypal/subscription-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: amount, cause: state.cause }),
        })
          .then(function (res) {
            return res.json().then(function (json) {
              if (!res.ok || !json.planId) throw new Error('plan_failed');
              return actions.subscription.create({ plan_id: json.planId });
            });
          });
      },
      onApprove: function (data) {
        document.dispatchEvent(
          new CustomEvent('acura:analytics', { detail: { event: 'doacao_paypal_clicada', params: { type: 'monthly' } } })
        );
        showPaypalSuccess('monthly', data.subscriptionID || '');
      },
      onError: function (err) {
        console.error('PayPal monthly error:', err);
      },
    });

    if (paypalState.monthlyButtons.isEligible()) {
      return paypalState.monthlyButtons.render('#paypal-monthly-container');
    }
    showPaypalUnavailable('monthly');
  }

  function renderPaypalButtons() {
    if (!paypalState.enabled || !paypalState.clientId) {
      showPaypalUnavailable(state.type === 'mensal' ? 'monthly' : 'once');
      return;
    }

    hidePaypalUnavailable();
    var intent = state.type === 'mensal' ? 'subscription' : 'capture';

    loadPaypalSdk(intent)
      .then(function () {
        if (state.type === 'mensal') {
          return renderPaypalMonthly();
        }
        return renderPaypalOnce();
      })
      .catch(function (err) {
        console.error('PayPal init failed:', err);
        showPaypalUnavailable(state.type === 'mensal' ? 'monthly' : 'once');
      });
  }

  function initPaypal() {
    fetch('/api/paypal/config')
      .then(function (res) { return res.json(); })
      .then(function (cfg) {
        paypalState.clientId = cfg.clientId || '';
        paypalState.enabled = !!cfg.enabled;
        if (!paypalState.enabled) {
          showPaypalUnavailable('once');
          showPaypalUnavailable('monthly');
          return;
        }
        renderPaypalButtons();
      })
      .catch(function () {
        showPaypalUnavailable('once');
        showPaypalUnavailable('monthly');
      });
  }

  function onLangChange() {
    updateBadgePreview(getActiveAmount());
    var earned = document.getElementById('earned-badge');
    if (earned && !earned.hidden) {
      var id = earned.dataset.badge;
      var keys = {
        anjo: ['doacao.badge.anjo.name', 'doacao.badge.anjo.desc'],
        guardiao: ['doacao.badge.guardiao.name', 'doacao.badge.guardiao.desc'],
        protetor: ['doacao.badge.protetor.name', 'doacao.badge.protetor.desc'],
        benemerito: ['doacao.badge.benemerito.name', 'doacao.badge.benemerito.desc'],
        patrono: ['doacao.badge.patrono.name', 'doacao.badge.patrono.desc'],
        mecenas: ['doacao.badge.mecenas.name', 'doacao.badge.mecenas.desc'],
        amigo: ['doacao.badge.amigo.name', 'doacao.badge.amigo.desc'],
      };
      if (keys[id]) {
        var nameEl = earned.querySelector('.earned-badge-name');
        var descEl = earned.querySelector('.earned-badge-desc');
        if (nameEl) nameEl.textContent = t(keys[id][0]);
        if (descEl) descEl.textContent = t(keys[id][1]);
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindAmountButtons();
    bindTypeTabs();
    bindCauseTabs();
    bindCustomAmount();
    bindCopyPix();
    bindRegisterForm();
    initPaypal();
    updateAmountDisplay();
    updateImpactDisplay(50, document.querySelector('[data-amount="50"]'));

    var angelBtn = document.getElementById('angel-register-btn');
    if (angelBtn) angelBtn.href = CONFIG.angelRegisterUrl;

    document.addEventListener('acura:langchange', onLangChange);
  });
})();
