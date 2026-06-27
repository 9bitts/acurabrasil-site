(function () {
  const menuToggle = document.querySelector('.menu-toggle');
  const navMenu = document.querySelector('.nav-menu');
  const header = document.querySelector('.header');

  if (menuToggle && navMenu) {
    const setMenuOpen = (open) => {
      navMenu.classList.toggle('open', open);
      menuToggle.classList.toggle('active', open);
      menuToggle.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('menu-open', open);
      if (window.AcuraI18n) {
        menuToggle.setAttribute(
          'aria-label',
          window.AcuraI18n.t(window.AcuraI18n.getLang(), open ? 'common.menuClose' : 'common.menuOpen')
        );
      }
    };

    menuToggle.addEventListener('click', () => {
      setMenuOpen(!navMenu.classList.contains('open'));
    });

    navMenu.querySelectorAll('.nav-link, .nav-dropdown-menu a').forEach((link) => {
      link.addEventListener('click', () => {
        setMenuOpen(false);
        document.querySelectorAll('.nav-dropdown.open').forEach((d) => d.classList.remove('open'));
      });
    });
  }

  document.querySelectorAll('.nav-dropdown-toggle').forEach((toggle) => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = toggle.closest('.nav-dropdown');
      if (!dropdown) return;
      const isOpen = dropdown.classList.contains('open');
      document.querySelectorAll('.nav-dropdown.open').forEach((d) => {
        if (d !== dropdown) d.classList.remove('open');
      });
      dropdown.classList.toggle('open', !isOpen);
      toggle.setAttribute('aria-expanded', String(!isOpen));
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.nav-dropdown.open').forEach((d) => {
      d.classList.remove('open');
      const btn = d.querySelector('.nav-dropdown-toggle');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  });

  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link, .nav-dropdown-menu a, .footer-links a').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('http')) return;
    const page = href.split('#')[0];
    if (page === currentPage || (currentPage === '' && page === 'index.html')) {
      link.classList.add('active');
    }
  });

  if (header) {
    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 20);
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId.length <= 1) return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  const contactForm = document.querySelector('#contact-form');
  if (contactForm) {
    const assuntoSelect = contactForm.querySelector('#assunto');
    const statusEl = document.getElementById('contact-form-status');
    const submitBtn = contactForm.querySelector('[type="submit"]');
    const params = new URLSearchParams(window.location.search);
    const presetAssunto = params.get('assunto');

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

    if (assuntoSelect && presetAssunto) {
      const option = assuntoSelect.querySelector(`option[value="${presetAssunto}"]`);
      if (option) assuntoSelect.value = presetAssunto;
    }

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearStatus();

      if (!contactForm.checkValidity()) {
        contactForm.reportValidity();
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      showStatus('info', 'contato.form.sending');

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 18_000);

        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            nome: contactForm.querySelector('#nome')?.value.trim() || '',
            email: contactForm.querySelector('#email')?.value.trim() || '',
            assunto: assuntoSelect?.value || '',
            mensagem: contactForm.querySelector('#mensagem')?.value.trim() || '',
            website: contactForm.querySelector('#website')?.value || '',
          }),
        });

        clearTimeout(timeoutId);

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.ok) {
          showStatus('success', 'contato.form.success');
          contactForm.reset();
          if (assuntoSelect && presetAssunto) {
            const option = assuntoSelect.querySelector(`option[value="${presetAssunto}"]`);
            if (option) assuntoSelect.value = presetAssunto;
          }
          return;
        }

        if (res.status === 429) {
          showStatus('error', 'contato.form.errorRateLimit');
          return;
        }

        showStatus('error', 'contato.form.error');
      } catch {
        showStatus('error', 'contato.form.errorNetwork');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
})();
