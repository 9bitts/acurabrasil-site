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

  const contactForm = document.querySelector('.contact-form-mailto');
  if (contactForm) {
    const assuntoSelect = contactForm.querySelector('#assunto');
    const params = new URLSearchParams(window.location.search);
    const presetAssunto = params.get('assunto');
    if (assuntoSelect && presetAssunto) {
      const option = assuntoSelect.querySelector(`option[value="${presetAssunto}"]`);
      if (option) assuntoSelect.value = presetAssunto;
    }

    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const nome = contactForm.querySelector('#nome')?.value.trim() || '';
      const email = contactForm.querySelector('#email')?.value.trim() || '';
      const assunto = assuntoSelect?.selectedOptions[0]?.textContent.trim() || '';
      const mensagem = contactForm.querySelector('#mensagem')?.value.trim() || '';
      const subject = encodeURIComponent(`[ACURA BRASIL] ${assunto}`);
      const body = encodeURIComponent(
        `Nombre: ${nome}\nCorreo: ${email}\nAsunto: ${assunto}\n\n${mensagem}`
      );
      window.location.href = `mailto:contato@acurabrasil.org?subject=${subject}&body=${body}`;
    });
  }
})();
