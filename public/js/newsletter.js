(function () {
  'use strict';

  function t(key) {
    if (window.AcuraI18n) {
      return window.AcuraI18n.t(window.AcuraI18n.getLang(), key);
    }
    return key;
  }

  function showStatus(el, type, messageKey) {
    if (!el) return;
    el.hidden = false;
    el.className = 'footer-newsletter-status ' + type;
    el.textContent = t(messageKey);
  }

  function initForm(form) {
    var statusEl = form.querySelector('.footer-newsletter-status');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome.value.trim(),
          email: form.email.value.trim(),
          privacidade: form.privacidade.checked,
          website: form.website ? form.website.value : '',
        }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (result.ok && result.data.ok) {
            showStatus(statusEl, 'success', 'footer.newsletter.success');
            form.reset();
            document.dispatchEvent(
              new CustomEvent('acura:analytics', {
                detail: { event: 'newsletter_inscrito', params: {} },
              })
            );
            return;
          }
          var err = result.data && result.data.error;
          if (err === 'rate_limit') showStatus(statusEl, 'error', 'footer.newsletter.rateLimit');
          else if (err === 'privacidade_required') showStatus(statusEl, 'error', 'footer.newsletter.privacyRequired');
          else if (err === 'email_invalid') showStatus(statusEl, 'error', 'footer.newsletter.emailInvalid');
          else showStatus(statusEl, 'error', 'footer.newsletter.error');
        })
        .catch(function () {
          showStatus(statusEl, 'error', 'footer.newsletter.error');
        })
        .finally(function () {
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  function init() {
    document.querySelectorAll('.footer-newsletter-form').forEach(initForm);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
