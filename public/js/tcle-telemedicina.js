(function () {
  const bodyEl = document.getElementById('tcle-body');
  if (!bodyEl) return;

  function getLang() {
    return window.AcuraI18n?.getLang?.() === 'es' ? 'es' : 'pt';
  }

  function render() {
    const lang = getLang();
    const html = window.TcleTelemedicinaContent?.[lang] || window.TcleTelemedicinaContent?.pt || '';
    bodyEl.innerHTML = html;
  }

  document.addEventListener('acura:langchange', render);
  render();
})();
