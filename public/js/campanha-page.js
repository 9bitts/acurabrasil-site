(function () {
  'use strict';

  var paypalState = {
    clientId: '',
    enabled: false,
    sdkIntent: null,
    onceButtons: null,
    monthlyButtons: null,
  };

  var campaign = null;
  var lastDetail = null;
  var state = {
    amount: 50,
    type: 'unica',
    customAmount: '',
  };

  function t(key) {
    var current = lang();
    var fromApi =
      window.AcuraI18n && typeof window.AcuraI18n.t === 'function'
        ? window.AcuraI18n.t(current, key)
        : null;
    if (fromApi && fromApi !== key) return fromApi;

    var bundled =
      (current === 'pt' ? window.ACURA_I18N_PT : window.ACURA_I18N_ES) ||
      window.ACURA_I18N_ES ||
      window.ACURA_I18N_PT;
    if (bundled && bundled[key]) return bundled[key];

    var mapped =
      window.ACURA_I18N &&
      (window.ACURA_I18N[current] || window.ACURA_I18N.es || window.ACURA_I18N.pt);
    if (mapped && mapped[key]) return mapped[key];

    return key;
  }

  function lang() {
    if (window.AcuraI18n && typeof window.AcuraI18n.getLang === 'function') {
      return window.AcuraI18n.getLang();
    }
    if (window.AcuraI18nLoader && typeof window.AcuraI18nLoader.getLang === 'function') {
      return window.AcuraI18nLoader.getLang();
    }
    try {
      return localStorage.getItem('acura.lang') || 'es';
    } catch (e) {
      return 'es';
    }
  }

  function i18nReady() {
    if (window.__ACURA_I18N_READY__) return true;
    if (window.ACURA_I18N_ES || window.ACURA_I18N_PT) return true;
    var current = lang();
    return !!(
      window.ACURA_I18N &&
      (window.ACURA_I18N[current] || window.ACURA_I18N.es || window.ACURA_I18N.pt)
    );
  }

  function whenI18nReady(cb) {
    if (i18nReady()) {
      cb();
      return;
    }
    var done = false;
    function run() {
      if (done) return;
      done = true;
      cb();
    }
    document.addEventListener('acura:i18n-ready', run, { once: true });
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (i18nReady() || tries > 40) {
        clearInterval(timer);
        run();
      }
    }, 50);
  }

  function pick(obj, ptKey, esKey) {
    if (!obj) return '';
    return lang() === 'pt' ? obj[ptKey] : obj[esKey] || obj[ptKey];
  }

  function money(n) {
    return Number(n || 0).toLocaleString(lang() === 'pt' ? 'pt-BR' : 'es-VE', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  function esc(s) {
    var el = document.createElement('span');
    el.textContent = s == null ? '' : String(s);
    return el.innerHTML;
  }

  function slugFromPath() {
    var parts = location.pathname.replace(/\/+$/, '').split('/');
    return parts[parts.length - 1] || '';
  }

  function getActiveAmount() {
    if (state.customAmount) {
      var custom = parseFloat(String(state.customAmount).replace(',', '.'));
      if (!isNaN(custom) && custom > 0) return custom;
    }
    return state.amount;
  }

  function getBadgeId(amount, type) {
    if (type === 'mensal') {
      if (amount >= 250) return 'patrono';
      if (amount >= 100) return 'benemerito';
      if (amount >= 30) return 'protetor';
      return 'amigo';
    }
    if (campaign && campaign.destination === 'pesquisa' && amount >= 200) return 'mecenas';
    if (amount >= 1000) return 'patrono';
    if (amount >= 500) return 'benemerito';
    if (amount >= 100) return 'protetor';
    if (amount >= 30) return 'guardiao';
    return 'amigo';
  }

  function youtubeEmbed(url) {
    if (!url) return '';
    var m = String(url).match(/(?:youtu\.be\/|v=|\/embed\/)([\w-]{6,})/);
    if (!m) return '';
    return (
      '<div class="campanha-video"><iframe src="https://www.youtube-nocookie.com/embed/' +
      esc(m[1]) +
      '" title="Video" allowfullscreen loading="lazy" style="width:100%;aspect-ratio:16/9;border:0;border-radius:12px"></iframe></div>'
    );
  }

  function progressBlock(c, variant) {
    var pct = c.goal_amount > 0 ? Math.min(100, c.progress_pct != null ? c.progress_pct : 0) : 0;
    var cls =
      variant === 'hero'
        ? 'campanha-progress campanha-progress--hero'
        : 'campanha-progress campanha-progress--side';
    var bar =
      c.show_thermometer && c.goal_amount > 0
        ? '<div class="campanha-thermo-bar" role="progressbar" aria-valuenow="' +
          pct +
          '" aria-valuemin="0" aria-valuemax="100"><div class="campanha-thermo-fill" style="width:' +
          pct +
          '%"></div></div>'
        : '';
    return (
      '<div class="' +
      cls +
      '" id="' +
      (variant === 'hero' ? 'campanha-progress-hero' : '') +
      '">' +
      '<div class="campanha-progress-stats">' +
      '<div class="campanha-progress-stat">' +
      '<strong id="progress-raised">' +
      esc(money(c.raised_amount)) +
      '</strong>' +
      '<span>' +
      esc(t('campanha.progress.raised')) +
      (c.goal_amount > 0
        ? ' · ' + esc(t('campanha.progress.goal')) + ' ' + esc(money(c.goal_amount))
        : '') +
      '</span>' +
      '</div>' +
      '<div class="campanha-progress-stat campanha-progress-stat--donors">' +
      '<strong id="progress-donors">' +
      esc(String(c.donor_count || 0)) +
      '</strong>' +
      '<span>' +
      esc(t('campanha.progress.donors')) +
      '</span>' +
      '</div>' +
      '</div>' +
      bar +
      (c.goal_amount > 0 && c.show_thermometer
        ? '<p class="campanha-progress-pct" id="progress-pct">' +
          pct +
          '% ' +
          esc(t('campanha.progress.ofGoal')) +
          '</p>'
        : '') +
      '</div>'
    );
  }

  function updateProgressUI(c) {
    campaign = Object.assign({}, campaign, c);
    var pct =
      campaign.goal_amount > 0
        ? Math.min(100, Math.round((campaign.raised_amount / campaign.goal_amount) * 100))
        : 0;
    campaign.progress_pct = pct;

    var raisedEl = document.getElementById('progress-raised');
    var donorsEl = document.getElementById('progress-donors');
    var pctEl = document.getElementById('progress-pct');
    var fill = document.querySelector('#campanha-progress-hero .campanha-thermo-fill');
    var hero = document.getElementById('campanha-progress-hero');

    if (raisedEl) raisedEl.textContent = money(campaign.raised_amount);
    if (donorsEl) donorsEl.textContent = String(campaign.donor_count || 0);
    if (pctEl) pctEl.textContent = pct + '% ' + t('campanha.progress.ofGoal');
    if (fill) fill.style.width = pct + '%';
    if (hero) {
      hero.classList.remove('campanha-progress--pulse');
      void hero.offsetWidth;
      hero.classList.add('campanha-progress--pulse');
      hero.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function showThankYou(amount, frequency) {
    var existing = document.getElementById('campanha-thanks');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'campanha-thanks';
    overlay.className = 'campanha-thanks';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div class="campanha-thanks-card">' +
      '<div class="campanha-thanks-icon" aria-hidden="true">♥</div>' +
      '<p class="campanha-thanks-eyebrow">' +
      esc(t('campanha.thanks.eyebrow')) +
      '</p>' +
      '<h2>' +
      esc(t('campanha.thanks.title')) +
      '</h2>' +
      '<p class="campanha-thanks-amount">' +
      esc(money(amount)) +
      (frequency === 'monthly' ? ' <span>/ ' + esc(t('campanha.type.monthly')) + '</span>' : '') +
      '</p>' +
      '<p class="campanha-thanks-text">' +
      esc(t('campanha.thanks.text')) +
      '</p>' +
      '<p class="campanha-thanks-bar-note">' +
      esc(t('campanha.thanks.barNote')) +
      '</p>' +
      '<button type="button" class="btn btn-verde" id="campanha-thanks-close">' +
      esc(t('campanha.thanks.cta')) +
      '</button>' +
      '</div>';

    document.body.appendChild(overlay);
    requestAnimationFrame(function () {
      overlay.classList.add('is-visible');
    });

    function close() {
      overlay.classList.remove('is-visible');
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        var hero = document.getElementById('campanha-progress-hero');
        if (hero) hero.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 280);
    }

    document.getElementById('campanha-thanks-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
  }

  function renderPage(detail) {
    lastDetail = detail;
    campaign = detail.campaign;
    campaign.enable_paypal = true;
    campaign.enable_paypal_monthly = campaign.allow_monthly !== false;

    var title = pick(campaign, 'title_pt', 'title_es');
    var summary = pick(campaign, 'summary_pt', 'summary_es');
    var body = pick(campaign, 'body_pt', 'body_es');
    var impact = pick(campaign, 'impact_text_pt', 'impact_text_es');
    var matching = pick(campaign, 'matching_text_pt', 'matching_text_es');
    var ctaLabel = pick(campaign, 'secondary_cta_label_pt', 'secondary_cta_label_es');
    var seoTitle = pick(campaign, 'seo_title_pt', 'seo_title_es') || title;
    var seoDesc = pick(campaign, 'seo_description_pt', 'seo_description_es') || summary;

    document.title = seoTitle + ' - ACURABRASIL';
    var ogTitle = document.getElementById('og-title');
    var ogDesc = document.getElementById('og-desc');
    var ogImage = document.getElementById('og-image');
    if (ogTitle) ogTitle.setAttribute('content', seoTitle);
    if (ogDesc) ogDesc.setAttribute('content', seoDesc);
    if (ogImage && campaign.cover_url) {
      var img = campaign.cover_url.startsWith('http')
        ? campaign.cover_url
        : 'https://www.acurabrasil.org' + campaign.cover_url;
      ogImage.setAttribute('content', img);
    }

    var amounts =
      campaign.suggested_amounts && campaign.suggested_amounts.length
        ? campaign.suggested_amounts
        : [30, 50, 100, 250, 500, 1000];
    if (!amounts.includes(state.amount)) state.amount = amounts[1] || amounts[0] || 50;

    var statusBanner = '';
    if (campaign.status === 'paused') {
      statusBanner =
        '<div class="campanha-status-banner">' + esc(t('campanha.status.paused')) + '</div>';
    } else if (campaign.status === 'closed') {
      statusBanner =
        '<div class="campanha-status-banner campanha-status-banner--closed">' +
        esc(t('campanha.status.closed')) +
        '</div>';
    }

    var canDonate =
      campaign.accepts_donation &&
      (campaign.status === 'published' || campaign.status === 'paused');

    var gallery =
      (campaign.gallery || [])
        .map(function (u) {
          return '<img src="' + esc(u) + '" alt="" loading="lazy">';
        })
        .join('') || '';

    var updates = (detail.updates || [])
      .map(function (u) {
        return (
          '<article class="campanha-update"><time>' +
          esc(String(u.created_at || '').slice(0, 10)) +
          '</time><h3>' +
          esc(pick(u, 'title_pt', 'title_es')) +
          '</h3><p style="white-space:pre-wrap">' +
          esc(pick(u, 'body_pt', 'body_es')) +
          '</p></article>'
        );
      })
      .join('');

    var faqs = (detail.faqs || [])
      .map(function (f) {
        return (
          '<details class="campanha-faq"><summary>' +
          esc(pick(f, 'question_pt', 'question_es')) +
          '</summary><p style="white-space:pre-wrap">' +
          esc(pick(f, 'answer_pt', 'answer_es')) +
          '</p></details>'
        );
      })
      .join('');

    var donors = (detail.donors || [])
      .map(function (d) {
        return (
          '<li><span>' +
          esc(d.name || t('campanha.donor.anonymous')) +
          '</span><span>' +
          (d.amount != null ? esc(money(d.amount)) : '') +
          '</span></li>'
        );
      })
      .join('');

    var amountBtns = amounts
      .map(function (a) {
        return (
          '<button type="button" class="campanha-amount-btn' +
          (a === state.amount ? ' active' : '') +
          '" data-amount="' +
          a +
          '">' +
          esc(money(a)) +
          '</button>'
        );
      })
      .join('');

    var donatePanel = !canDonate
      ? '<aside class="campanha-donate-panel" id="doar"><p>' +
        esc(t('campanha.donate.unavailable')) +
        '</p></aside>'
      : '<aside class="campanha-donate-panel" id="doar">' +
        '<h2>' +
        esc(t('campanha.donate.title')) +
        '</h2>' +
        '<p class="campanha-pay-note">' +
        esc(t('campanha.donate.paypalOnly')) +
        '</p>' +
        (matching ? '<p class="campanha-matching">' + esc(matching) + '</p>' : '') +
        (impact ? '<p class="campanha-impact">' + esc(impact) + '</p>' : '') +
        (campaign.allow_once && campaign.allow_monthly
          ? '<div class="campanha-type-tabs"><button type="button" data-dtype="unica" class="active">' +
            esc(t('campanha.type.once')) +
            '</button><button type="button" data-dtype="mensal">' +
            esc(t('campanha.type.monthly')) +
            '</button></div>'
          : '') +
        '<div class="campanha-amounts">' +
        amountBtns +
        '</div>' +
        '<div class="doacao-custom-amount"><label for="custom-amount">' +
        esc(t('doacao.amount.custom')) +
        '</label><input type="number" id="custom-amount" min="' +
        campaign.min_amount +
        '" max="' +
        campaign.max_amount +
        '" step="1" placeholder="0,00"></div>' +
        '<div data-panel="unica">' +
        '<h3>' +
        esc(t('doacao.paypal.once.title')) +
        '</h3>' +
        '<div id="paypal-once-container" class="paypal-button-container"></div>' +
        '<p id="paypal-once-unavailable" hidden>' +
        esc(t('doacao.paypal.unavailable')) +
        '</p></div>' +
        (campaign.allow_monthly
          ? '<div data-panel="mensal" hidden><h3>' +
            esc(t('doacao.paypal.monthly.title')) +
            '</h3><div id="paypal-monthly-container" class="paypal-button-container"></div>' +
            '<p id="paypal-monthly-unavailable" hidden>' +
            esc(t('doacao.paypal.unavailable')) +
            '</p></div>'
          : '') +
        '<div class="campanha-share"><button type="button" class="btn btn-outline btn-sm" id="share-campaign">' +
        esc(t('campanha.share')) +
        '</button></div>' +
        '<p class="campanha-pix-alt">' +
        esc(t('campanha.donate.pixAlt')) +
        ' <a href="/doacao">' +
        esc(t('campanha.donate.pixAltLink')) +
        '</a></p>' +
        '</aside>';

    var attachmentsHtml = (campaign.attachments || [])
      .map(function (doc) {
        var label = pick(doc, 'title_pt', 'title_es') || doc.url;
        return (
          '<li><a class="campanha-doc-link" href="' +
          esc(doc.url) +
          '" target="_blank" rel="noopener" download>' +
          esc(label) +
          '</a></li>'
        );
      })
      .join('');

    var secondaryCtaHtml =
      ctaLabel && campaign.secondary_cta_url
        ? '<p class="campanha-secondary-cta"><a class="btn btn-outline" href="' +
          esc(campaign.secondary_cta_url) +
          '">' +
          esc(ctaLabel) +
          '</a></p>'
        : '';

    var root = document.getElementById('campanha-root');
    root.innerHTML =
      '<div class="container campanha-layout">' +
      '<article class="campanha-story">' +
      '<div class="breadcrumb"><a href="/">' +
      esc(t('common.breadcrumbHome')) +
      '</a> / <a href="/campanhas">' +
      esc(t('campanhas.breadcrumb')) +
      '</a> / <span>' +
      esc(title) +
      '</span></div>' +
      statusBanner +
      '<img class="campanha-cover" src="' +
      esc(campaign.cover_url) +
      '" alt="">' +
      youtubeEmbed(campaign.video_url) +
      progressBlock(campaign, 'hero') +
      '<h1>' +
      esc(title) +
      '</h1>' +
      '<p class="campanha-summary">' +
      esc(summary) +
      '</p>' +
      secondaryCtaHtml +
      '<div class="campanha-story-body">' +
      esc(body) +
      '</div>' +
      (attachmentsHtml
        ? '<section class="campanha-docs"><h2>' +
          esc(t('campanha.docs.title')) +
          '</h2><ul class="campanha-docs-list">' +
          attachmentsHtml +
          '</ul></section>'
        : '') +
      (gallery ? '<div class="campanha-gallery">' + gallery + '</div>' : '') +
      (updates
        ? '<section class="campanha-updates"><h2>' +
          esc(t('campanha.updates')) +
          '</h2>' +
          updates +
          '</section>'
        : '') +
      (faqs
        ? '<section class="campanha-faqs"><h2>' + esc(t('campanha.faq')) + '</h2>' + faqs + '</section>'
        : '') +
      (donors
        ? '<section class="campanha-donors"><h2>' +
          esc(t('campanha.donors')) +
          '</h2><ul class="campanha-donor-list">' +
          donors +
          '</ul></section>'
        : '') +
      '</article>' +
      donatePanel +
      '</div>';

    bindDonateUi();
    if (canDonate) initPaypal();
  }

  function syncPanels() {
    document.querySelectorAll('[data-panel]').forEach(function (el) {
      el.hidden = el.getAttribute('data-panel') !== state.type;
    });
    document.querySelectorAll('[data-dtype]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-dtype') === state.type);
    });
  }

  function bindDonateUi() {
    document.querySelectorAll('.campanha-amount-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.amount = Number(btn.dataset.amount);
        state.customAmount = '';
        var custom = document.getElementById('custom-amount');
        if (custom) custom.value = '';
        document.querySelectorAll('.campanha-amount-btn').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        schedulePaypalRender();
      });
    });

    var custom = document.getElementById('custom-amount');
    if (custom) {
      custom.addEventListener('input', function () {
        state.customAmount = custom.value;
        document.querySelectorAll('.campanha-amount-btn').forEach(function (b) {
          b.classList.remove('active');
        });
        schedulePaypalRender();
      });
    }

    document.querySelectorAll('[data-dtype]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.type = btn.getAttribute('data-dtype');
        syncPanels();
        schedulePaypalRender();
      });
    });
    syncPanels();

    var shareBtn = document.getElementById('share-campaign');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        var url = location.href;
        if (navigator.share) {
          navigator.share({ title: document.title, url: url }).catch(function () {});
        } else {
          navigator.clipboard.writeText(url).then(function () {
            alert(t('campanha.share.copied'));
          });
        }
      });
    }
  }

  var paypalRenderTimer = null;
  function schedulePaypalRender() {
    if (paypalRenderTimer) clearTimeout(paypalRenderTimer);
    paypalRenderTimer = setTimeout(renderPaypalButtons, 350);
  }

  function loadPaypalSdk(intent) {
    if (!paypalState.clientId) return Promise.reject(new Error('no client'));
    if (paypalState.sdkIntent === intent && window.paypal) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var existing = document.getElementById('paypal-sdk');
      if (existing) existing.remove();
      delete window.paypal;
      paypalState.sdkIntent = null;
      var script = document.createElement('script');
      script.id = 'paypal-sdk';
      var url =
        'https://www.paypal.com/sdk/js?client-id=' +
        encodeURIComponent(paypalState.clientId) +
        '&currency=BRL&components=buttons&disable-funding=credit';
      if (intent === 'subscription') url += '&vault=true&intent=subscription';
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
    try {
      if (paypalState.onceButtons && paypalState.onceButtons.close) paypalState.onceButtons.close();
      if (paypalState.monthlyButtons && paypalState.monthlyButtons.close)
        paypalState.monthlyButtons.close();
    } catch (e) {
      /* ignore */
    }
    paypalState.onceButtons = null;
    paypalState.monthlyButtons = null;
  }

  function afterPaypalSuccess(providerId, frequency, payerName) {
    var amount = getActiveAmount();
    return fetch('/api/campaigns/' + encodeURIComponent(campaign.slug) + '/donations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amount,
        method: 'paypal',
        frequency: frequency,
        provider_payment_id: providerId || '',
        donor_name: payerName || '',
        status: 'confirmed',
        badge_id: getBadgeId(amount, frequency === 'monthly' ? 'mensal' : 'unica'),
        notes: 'PayPal checkout',
      }),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (res) {
        if (res.ok && res.j.campaign) {
          updateProgressUI(res.j.campaign);
        } else {
          updateProgressUI({
            raised_amount: Number(campaign.raised_amount || 0) + amount,
            donor_count: Number(campaign.donor_count || 0) + 1,
            goal_amount: campaign.goal_amount,
            show_thermometer: campaign.show_thermometer,
          });
        }
        showThankYou(amount, frequency);
        try {
          localStorage.setItem(
            'acura.badge',
            JSON.stringify({
              id: getBadgeId(amount, frequency === 'monthly' ? 'mensal' : 'unica'),
              at: Date.now(),
              campaign: campaign.slug,
            })
          );
        } catch (e) {
          /* ignore */
        }
      })
      .catch(function () {
        updateProgressUI({
          raised_amount: Number(campaign.raised_amount || 0) + amount,
          donor_count: Number(campaign.donor_count || 0) + 1,
          goal_amount: campaign.goal_amount,
          show_thermometer: campaign.show_thermometer,
        });
        showThankYou(amount, frequency);
      });
  }

  function renderPaypalOnce() {
    var container = document.getElementById('paypal-once-container');
    if (!container || !window.paypal || state.type !== 'unica') return;
    closePaypalButtons();
    container.innerHTML = '';
    var amount = getActiveAmount();
    var label = pick(campaign, 'title_pt', 'title_es');
    paypalState.onceButtons = window.paypal.Buttons({
      style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'donate' },
      createOrder: function (_d, actions) {
        return actions.order.create({
          purchase_units: [
            {
              amount: { currency_code: 'BRL', value: amount.toFixed(2) },
              description: ('Doação ACURABRASIL — ' + label).slice(0, 127),
              custom_id: ('campaign:' + campaign.id + ':' + campaign.slug).slice(0, 127),
            },
          ],
        });
      },
      onApprove: function (data, actions) {
        return actions.order.capture().then(function (details) {
          var id = details.id || data.orderID || '';
          var payerName =
            details.payer && details.payer.name
              ? [details.payer.name.given_name, details.payer.name.surname].filter(Boolean).join(' ')
              : '';
          return afterPaypalSuccess(id, 'once', payerName);
        });
      },
    });
    if (paypalState.onceButtons.isEligible()) {
      return paypalState.onceButtons.render('#paypal-once-container');
    }
    var msg = document.getElementById('paypal-once-unavailable');
    if (msg) msg.hidden = false;
  }

  function renderPaypalMonthly() {
    var container = document.getElementById('paypal-monthly-container');
    if (!container || !window.paypal || state.type !== 'mensal' || !campaign.allow_monthly) return;
    closePaypalButtons();
    container.innerHTML = '';
    var amount = getActiveAmount();
    var label = pick(campaign, 'title_pt', 'title_es');
    paypalState.monthlyButtons = window.paypal.Buttons({
      style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'subscribe' },
      createSubscription: function (_d, actions) {
        return fetch('/api/paypal/subscription-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: amount,
            cause: campaign.destination === 'pesquisa' ? 'pesquisa' : 'humanitaria',
            campaignLabel: label,
          }),
        }).then(function (res) {
          return res.json().then(function (json) {
            if (!res.ok || !json.planId) throw new Error('plan_failed');
            return actions.subscription.create({ plan_id: json.planId });
          });
        });
      },
      onApprove: function (data) {
        return afterPaypalSuccess(data.subscriptionID || '', 'monthly', '');
      },
    });
    if (paypalState.monthlyButtons.isEligible()) {
      return paypalState.monthlyButtons.render('#paypal-monthly-container');
    }
    var msg = document.getElementById('paypal-monthly-unavailable');
    if (msg) msg.hidden = false;
  }

  function renderPaypalButtons() {
    if (!paypalState.enabled || !paypalState.clientId) {
      ['paypal-once-unavailable', 'paypal-monthly-unavailable'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.hidden = false;
      });
      return;
    }
    var intent = state.type === 'mensal' ? 'subscription' : 'capture';
    loadPaypalSdk(intent)
      .then(function () {
        return state.type === 'mensal' ? renderPaypalMonthly() : renderPaypalOnce();
      })
      .catch(function () {
        var id = state.type === 'mensal' ? 'paypal-monthly-unavailable' : 'paypal-once-unavailable';
        var el = document.getElementById(id);
        if (el) el.hidden = false;
      });
  }

  function initPaypal() {
    fetch('/api/paypal/config')
      .then(function (r) {
        return r.json();
      })
      .then(function (cfg) {
        paypalState.clientId = cfg.clientId || '';
        paypalState.enabled = !!cfg.enabled;
        renderPaypalButtons();
      })
      .catch(function () {
        renderPaypalButtons();
      });
  }

  function load() {
    var slug = slugFromPath();
    fetch('/api/campaigns/' + encodeURIComponent(slug))
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (res) {
        if (!res.ok || !res.j.campaign) {
          document.getElementById('campanha-root').innerHTML =
            '<div class="container"><p class="campanhas-empty">' +
            esc(t('campanha.notFound')) +
            ' <a href="/campanhas">' +
            esc(t('campanhas.breadcrumb')) +
            '</a></p></div>';
          return;
        }
        lastDetail = res.j;
        whenI18nReady(function () {
          renderPage(lastDetail);
        });
      })
      .catch(function () {
        document.getElementById('campanha-root').innerHTML =
          '<div class="container"><p class="campanhas-empty">' + esc(t('campanhas.error')) + '</p></div>';
      });
  }

  document.addEventListener('DOMContentLoaded', load);
  document.addEventListener('acura:langchange', function () {
    if (!lastDetail) return;
    whenI18nReady(function () {
      renderPage(lastDetail);
    });
  });
  document.addEventListener('acura:i18n-ready', function () {
    if (lastDetail) renderPage(lastDetail);
  });
})();
