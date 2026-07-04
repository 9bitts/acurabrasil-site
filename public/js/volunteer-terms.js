(function () {
  const VOLUNTEER_SUBJECTS = ['sos-venezuela', 'sos-saude'];
  const TERMS_VERSION = window.VolunteerTermsContent?.version || '1.0';

  const group = document.getElementById('volunteer-terms-group');
  const bodyEl = document.getElementById('volunteer-terms-body');
  const checkbox = document.getElementById('voluntario-termo');
  const assuntoSelect = document.querySelector('#contact-form #assunto');

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

  function syncTermsVisibility() {
    const show = needsVolunteerTerms();
    group.hidden = !show;
    checkbox.required = show;
    if (!show) {
      checkbox.checked = false;
    }
  }

  assuntoSelect.addEventListener('change', syncTermsVisibility);

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
