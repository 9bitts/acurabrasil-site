(function () {
  'use strict';

  var CONFIG = {
    pixKey: '30.350.850/0001-80',
    pixName: 'ABRAC BRASIL',
    pixCity: 'BELO HORIZONTE',
    paypalBusiness: 'contato@acurabrasil.org',
    angelRegisterUrl: 'https://app.doctor8.org/register/angel',
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
    var img = document.getElementById('pix-qr');
    if (!img) return;
    var amount = getActiveAmount();
    var payload = generatePixPayload(amount);
    img.src =
      'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' +
      encodeURIComponent(payload);
    img.alt = 'QR Code Pix R$ ' + amount.toFixed(2);
  }

  function updateAmountDisplay() {
    var amount = getActiveAmount();
    var display = document.getElementById('pix-amount-display');
    if (display) display.textContent = 'R$ ' + amount.toFixed(2).replace('.', ',');
    var paypalOnce = document.getElementById('paypal-amount');
    var paypalMonthly = document.getElementById('paypal-monthly');
    if (paypalOnce) paypalOnce.value = amount.toFixed(2);
    if (paypalMonthly) paypalMonthly.value = amount.toFixed(2);
    updateQr();
    updateBadgePreview(amount);
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
      });
    });
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
  }

  function bindRegisterForm() {
    var form = document.getElementById('doacao-register-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = document.getElementById('doacao-form-status');
      var fd = new FormData(form);
      var amount = parseFloat(String(fd.get('valor') || '0').replace(',', '.')) || getActiveAmount();
      var tipo = fd.get('tipo_doacao') || state.type;
      var badge = getBadgeForAmount(amount, tipo === 'voluntario' ? 'voluntario' : tipo);
      if (fd.get('destino') === 'pesquisa' && amount >= 200) {
        badge = { id: 'mecenas', nameKey: 'doacao.badge.mecenas.name', descKey: 'doacao.badge.mecenas.desc' };
      }

      var body = {
        nome: fd.get('nome'),
        email: fd.get('email'),
        assunto: 'doacao',
        mensagem: [
          'Tipo: ' + tipo,
          'Destino: ' + (fd.get('destino') || state.cause),
          'Valor: R$ ' + amount.toFixed(2),
          'Selo: ' + badge.id,
          'Comprovante/ref: ' + (fd.get('comprovante') || 'não informado'),
          '',
          fd.get('mensagem') || '',
        ].join('\n'),
        website: fd.get('website') || '',
      };

      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
          if (!status) return;
          status.hidden = false;
          if (result.ok && result.data.ok) {
            status.className = 'form-status success';
            status.textContent = t('doacao.form.success');
            try {
              localStorage.setItem('acura.badge', JSON.stringify({ id: badge.id, at: Date.now() }));
            } catch (err) { /* ignore */ }
            showEarnedBadge(badge);
            form.reset();
          } else {
            status.className = 'form-status error';
            status.textContent = t('doacao.form.error');
          }
        })
        .catch(function () {
          if (status) {
            status.hidden = false;
            status.className = 'form-status error';
            status.textContent = t('doacao.form.error');
          }
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

  function initPaypalForms() {
    document.querySelectorAll('form[data-paypal-form]').forEach(function (form) {
      var business = form.querySelector('input[name="business"]');
      if (business) business.value = CONFIG.paypalBusiness;
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
    initPaypalForms();
    updateAmountDisplay();

    var angelBtn = document.getElementById('angel-register-btn');
    if (angelBtn) angelBtn.href = CONFIG.angelRegisterUrl;

    document.addEventListener('acura:langchange', onLangChange);
  });
})();
