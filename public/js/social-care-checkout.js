(function () {
  'use strict';

  var CHECKOUT_URL =
    (window.ACURA_DOCTOR8_APP || 'https://app.doctor8.org') +
    '/api/payments/checkout-social-care';

  function t(key, fallback) {
    if (typeof window.t === 'function') {
      var value = window.t(key);
      if (value && value !== key) return value;
    }
    return fallback;
  }

  function currentLang() {
    try {
      var stored = localStorage.getItem('acura.lang');
      if (stored === 'es' || stored === 'pt') return stored;
    } catch (e) { /* ignore */ }
    return document.documentElement.getAttribute('data-default-lang') === 'es' ? 'es' : 'pt';
  }

  function setCareType(value, label) {
    var input = document.getElementById('sa-care-type');
    var hint = document.getElementById('sa-care-type-label');
    if (input) input.value = value;
    if (hint) hint.textContent = label || value;
    document.querySelectorAll('[data-sa-care]').forEach(function (btn) {
      var selected = btn.getAttribute('data-sa-care') === value;
      btn.classList.toggle('is-selected', selected);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  function showStatus(form, message, isError) {
    var el = form.querySelector('[data-sa-pay-status]');
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || '';
    el.classList.toggle('sa-pay-status--error', Boolean(isError));
  }

  function init() {
    var form = document.getElementById('sa-social-care-form');
    if (!form) return;

    var initialType = form.careType.value || 'PSYCHOLOGIST';
    var initialBtn = document.querySelector('[data-sa-care="' + initialType + '"]');
    var initialLabel = (initialBtn && initialBtn.querySelector('h3') && initialBtn.querySelector('h3').textContent) || initialType;
    setCareType(initialType, initialLabel);

    document.querySelectorAll('[data-sa-care]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var value = btn.getAttribute('data-sa-care');
        var label = (btn.querySelector('h3') && btn.querySelector('h3').textContent) || value;
        setCareType(value, label);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var submit = form.querySelector('[type="submit"]');
      var payload = {
        campaign: form.campaign.value || 'setembro-amarelo',
        careType: form.careType.value,
        fullName: (form.fullName.value || '').trim(),
        email: (form.email.value || '').trim(),
        phone: (form.phone.value || '').trim(),
        reason: (form.reason.value || '').trim(),
        locale: currentLang(),
        website: form.website ? form.website.value : '',
        cancelUrl: window.location.origin + window.location.pathname + '#pagar',
      };

      if (!payload.fullName || !payload.email || !payload.phone || payload.reason.length < 10) {
        showStatus(form, t('sa.pay.error.fields', 'Preencha nome, e-mail, WhatsApp e o motivo (mínimo 10 caracteres).'), true);
        return;
      }

      showStatus(form, t('sa.pay.loading', 'Abrindo o pagamento seguro…'), false);
      if (submit) submit.disabled = true;

      fetch(CHECKOUT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          return res.json().then(function (body) {
            return { ok: res.ok, body: body };
          });
        })
        .then(function (result) {
          if (result.ok && result.body && result.body.checkoutUrl) {
            if (window.trackEvent) {
              window.trackEvent('consulta_iniciada', { campaign: payload.campaign, careType: payload.careType });
            }
            window.location.href = result.body.checkoutUrl;
            return;
          }
          var msg = (result.body && result.body.error === 'Invalid phone')
            ? t('sa.pay.error.phone', 'Informe um WhatsApp com DDD, por exemplo 31 98888-7777.')
            : t('sa.pay.error.generic', 'Não foi possível abrir o pagamento. Tente de novo em instantes.');
          showStatus(form, msg, true);
          if (submit) submit.disabled = false;
        })
        .catch(function () {
          showStatus(form, t('sa.pay.error.generic', 'Não foi possível abrir o pagamento. Tente de novo em instantes.'), true);
          if (submit) submit.disabled = false;
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
