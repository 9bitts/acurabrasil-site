(function () {
  const VOLUNTEER_SUBJECTS = ['sos-venezuela', 'sos-saude'];
  const TERMS_VERSION = window.VolunteerTermsContent?.version || '1.0';

  const group = document.getElementById('volunteer-terms-group');
  const bodyEl = document.getElementById('volunteer-terms-body');
  const checkbox = document.getElementById('voluntario-termo');
  const assuntoSelect = document.querySelector('#contact-form #assunto');
  const doctor8Link = document.getElementById('volunteer-doctor8-link');

  if (!group || !bodyEl || !checkbox || !assuntoSelect) return;

  function getLang() {
    return window.AcuraI18n?.getLang?.() === 'pt' ? 'pt' : 'es';
  }

  function renderTermsBody() {
    const lang = getLang();
    const html = window.VolunteerTermsContent?.[lang] || window.VolunteerTermsContent?.es || '';
    bodyEl.innerHTML = html;
  }

  function needsVolunteerTerms() {
    return VOLUNTEER_SUBJECTS.includes(assuntoSelect.value);
  }

  function syncDoctor8Link() {
    if (!doctor8Link) return;
    if (!needsVolunteerTerms()) {
      doctor8Link.classList.remove('is-disabled');
      doctor8Link.removeAttribute('aria-disabled');
      doctor8Link.removeAttribute('tabindex');
      return;
    }
    const enabled = checkbox.checked;
    if (enabled) {
      doctor8Link.classList.remove('is-disabled');
      doctor8Link.removeAttribute('aria-disabled');
      doctor8Link.removeAttribute('tabindex');
    } else {
      doctor8Link.classList.add('is-disabled');
      doctor8Link.setAttribute('aria-disabled', 'true');
      doctor8Link.setAttribute('tabindex', '-1');
    }
  }

  function syncTermsVisibility() {
    const show = needsVolunteerTerms();
    group.hidden = !show;
    checkbox.required = show;
    if (!show) {
      checkbox.checked = false;
    }
    syncDoctor8Link();
  }

  assuntoSelect.addEventListener('change', syncTermsVisibility);
  checkbox.addEventListener('change', syncDoctor8Link);

  if (doctor8Link) {
    doctor8Link.addEventListener('click', (e) => {
      if (!checkbox.checked) {
        e.preventDefault();
        group.scrollIntoView({ behavior: 'smooth', block: 'center' });
        group.querySelector('details')?.setAttribute('open', 'open');
      }
    });
  }

  document.addEventListener('acura:langchange', () => {
    renderTermsBody();
  });

  renderTermsBody();
  syncTermsVisibility();

  window.VolunteerTerms = {
    needsVolunteerTerms,
    isAccepted: () => !needsVolunteerTerms() || checkbox.checked,
    getPayload: () =>
      needsVolunteerTerms() && checkbox.checked
        ? { voluntario_termo: true, voluntario_termo_version: TERMS_VERSION }
        : {},
  };
})();
