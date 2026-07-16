(function () {
  'use strict';

  var PIX = {
    key: '30.350.850/0001-80',
    name: 'ACURABRASIL',
    city: 'BELO HORIZONTE',
  };

  var paypalState = {
    clientId: '',
    enabled: false,
    sdkIntent: null,
    onceButtons: null,
    monthlyButtons: null,
  };

  var campaign = null;
  var state = {
    amount: 50,
    type: 'unica',
    customAmount: '',
  };

  function t(key) {
    if (window.AcuraI18n && typeof window.AcuraI18n.t === 'function') {
      return window.AcuraI18n.t(key);
    }
    return key;
  }

  function lang() {
    try {
      return localStorage.getItem('acura.lang') || 'es';
    } catch (e) {
      return 'es';
    }
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
    return id + String(value.length).padStart(2, '0') + value;
  }

  function generatePixPayload(amount) {
    var key = PIX.key.replace(/\D/g, '');
    var merchantAccount = emv('00', 'br.gov.bcb.pix') + emv('01', key);
    var payload = emv('00', '01') + emv('26', merchantAccount);
    payload += emv('52', '0000') + emv('53', '986');
    if (amount && amount > 0) payload += emv('54', amount.toFixed(2));
    payload += emv('58', 'BR');
    payload += emv('59', PIX.name.substring(0, 25));
    payload += emv('60', PIX.city.substring(0, 15));
    payload += emv('62', emv('05', (campaign.slug || 'doacao').substring(0, 25)));
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

  function updateQr() {
    var canvas = document.getElementById('pix-qr');
    if (!canvas || !window.QRCode) return;
    var amount = getActiveAmount();
    window.QRCode.toCanvas(canvas, generatePixPayload(amount), { width: 200, margin: 1 }, function (err) {
      if (err) console.error(err);
    });
    var disp = document.getElementById('pix-amount-display');
    if (disp) disp.textContent = money(amount);
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

  function renderPage(detail) {
    campaign = detail.campaign;
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

    var amounts = campaign.suggested_amounts && campaign.suggested_amounts.length
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
        '</p>' +
        (ctaLabel && campaign.secondary_cta_url
          ? '<a class="btn btn-verde" href="' +
            esc(campaign.secondary_cta_url) +
            '">' +
            esc(ctaLabel) +
            '</a>'
          : '') +
        '</aside>'
      : '<aside class="campanha-donate-panel" id="doar">' +
        '<h2>' +
        esc(t('campanha.donate.title')) +
        '</h2>' +
        (campaign.show_thermometer
          ? '<div class="campanha-thermo"><div class="campanha-thermo-bar"><div class="campanha-thermo-fill" style="width:' +
            Math.min(100, campaign.progress_pct || 0) +
            '%"></div></div><div class="campanha-thermo-meta"><span>' +
            esc(money(campaign.raised_amount)) +
            (campaign.goal_amount > 0 ? ' / ' + esc(money(campaign.goal_amount)) : '') +
            '</span><span>' +
            esc(String(campaign.donor_count || 0)) +
            ' ' +
            esc(t('campanhas.donors')) +
            '</span></div></div>'
          : '') +
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
        (campaign.enable_pix
          ? '<div class="campanha-pix-box" data-panel="unica"><p id="pix-amount-display"></p><canvas id="pix-qr" width="200" height="200"></canvas><div class="campanha-pix-key"><code>' +
            PIX.key +
            '</code><button type="button" class="btn btn-outline btn-sm" id="copy-pix">' +
            esc(t('doacao.pix.copy')) +
            '</button></div><p class="doacao-pix-info">' +
            esc(t('doacao.pix.info')) +
            '</p></div>'
          : '') +
        (campaign.enable_pix && campaign.allow_monthly
          ? '<div data-panel="mensal" hidden><p>' +
            esc(t('doacao.pix.monthly.text')) +
            '</p><div class="campanha-pix-key"><code>' +
            PIX.key +
            '</code><button type="button" class="btn btn-outline btn-sm" id="copy-pix-m">' +
            esc(t('doacao.pix.copy')) +
            '</button></div></div>'
          : '') +
        (campaign.enable_paypal
          ? '<div data-panel="unica"><h3>' +
            esc(t('doacao.paypal.once.title')) +
            '</h3><div id="paypal-once-container" class="paypal-button-container"></div><p id="paypal-once-unavailable" hidden>' +
            esc(t('doacao.paypal.unavailable')) +
            '</p><p id="paypal-once-success" class="campanha-success" hidden></p></div>'
          : '') +
        (campaign.enable_paypal_monthly && campaign.allow_monthly
          ? '<div data-panel="mensal" hidden><h3>' +
            esc(t('doacao.paypal.monthly.title')) +
            '</h3><div id="paypal-monthly-container" class="paypal-button-container"></div><p id="paypal-monthly-unavailable" hidden>' +
            esc(t('doacao.paypal.unavailable')) +
            '</p><p id="paypal-monthly-success" class="campanha-success" hidden></p></div>'
          : '') +
        '<div class="campanha-register"><h3>' +
        esc(t('campanha.register.title')) +
        '</h3><form id="campanha-register-form">' +
        '<div class="form-group"><label>' +
        esc(t('campanha.register.name')) +
        '</label><input name="nome" required maxlength="120"></div>' +
        '<div class="form-group"><label>E-mail</label><input type="email" name="email" required maxlength="200"></div>' +
        '<label class="admin-check" style="margin:0.5rem 0"><input type="checkbox" name="anonymous"> ' +
        esc(t('campanha.register.anonymous')) +
        '</label>' +
        '<button type="submit" class="btn btn-verde" style="width:100%;margin-top:0.5rem">' +
        esc(t('campanha.register.submit')) +
        '</button>' +
        '<p id="register-status" role="status" hidden></p>' +
        '</form></div>' +
        '<div class="campanha-share"><button type="button" class="btn btn-outline btn-sm" id="share-campaign">' +
        esc(t('campanha.share')) +
        '</button></div>' +
        (ctaLabel && campaign.secondary_cta_url
          ? '<p style="margin-top:1rem"><a href="' +
            esc(campaign.secondary_cta_url) +
            '">' +
            esc(ctaLabel) +
            '</a></p>'
          : '') +
        '</aside>';

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
      '<h1>' +
      esc(title) +
      '</h1>' +
      '<p class="campanha-summary">' +
      esc(summary) +
      '</p>' +
      '<div class="campanha-story-body">' +
      esc(body) +
      '</div>' +
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
    if (canDonate) {
      updateQr();
      initPaypal();
    }
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
        updateQr();
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
        updateQr();
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

    function copyPix() {
      navigator.clipboard.writeText(PIX.key).then(function () {
        alert(t('doacao.pix.copied'));
      });
    }
    document.getElementById('copy-pix') &&
      document.getElementById('copy-pix').addEventListener('click', copyPix);
    document.getElementById('copy-pix-m') &&
      document.getElementById('copy-pix-m').addEventListener('click', copyPix);

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

    var form = document.getElementById('campanha-register-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(form);
        var amount = getActiveAmount();
        var badge = getBadgeId(amount, state.type);
        var payload = {
          amount: amount,
          method: 'pix',
          frequency: state.type === 'mensal' ? 'monthly' : 'once',
          donor_name: fd.get('nome'),
          donor_email: fd.get('email'),
          anonymous: !!fd.get('anonymous'),
          badge_id: badge,
          status: 'reported',
          notes: 'Registro via página da campanha',
        };
        var status = document.getElementById('register-status');
        fetch('/api/campaigns/' + encodeURIComponent(campaign.slug) + '/donations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (res) {
            if (status) {
              status.hidden = false;
              status.textContent = res.ok
                ? t('campanha.register.ok')
                : t('campanha.register.error');
              status.className = res.ok ? 'campanha-success' : '';
            }
            if (res.ok) {
              try {
                localStorage.setItem(
                  'acura.badge',
                  JSON.stringify({ id: badge, at: Date.now(), campaign: campaign.slug })
                );
              } catch (err) { /* ignore */ }
            }
          })
          .catch(function () {
            if (status) {
              status.hidden = false;
              status.textContent = t('campanha.register.error');
            }
          });
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
    } catch (e) { /* ignore */ }
    paypalState.onceButtons = null;
    paypalState.monthlyButtons = null;
  }

  function recordPaypalDonation(providerId, frequency) {
    return fetch('/api/campaigns/' + encodeURIComponent(campaign.slug) + '/donations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: getActiveAmount(),
        method: 'paypal',
        frequency: frequency,
        provider_payment_id: providerId || '',
        status: 'confirmed',
        badge_id: getBadgeId(getActiveAmount(), frequency === 'monthly' ? 'mensal' : 'unica'),
        notes: 'PayPal checkout',
      }),
    });
  }

  function renderPaypalOnce() {
    var container = document.getElementById('paypal-once-container');
    if (!container || !window.paypal || state.type !== 'unica' || !campaign.enable_paypal) return;
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
          var el = document.getElementById('paypal-once-success');
          if (el) {
            el.hidden = false;
            el.textContent = t('doacao.paypal.successOnce').replace('{id}', id);
          }
          recordPaypalDonation(id, 'once');
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
    if (
      !container ||
      !window.paypal ||
      state.type !== 'mensal' ||
      !campaign.enable_paypal_monthly
    )
      return;
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
        })
          .then(function (res) {
            return res.json().then(function (json) {
              if (!res.ok || !json.planId) throw new Error('plan_failed');
              return actions.subscription.create({ plan_id: json.planId });
            });
          });
      },
      onApprove: function (data) {
        var el = document.getElementById('paypal-monthly-success');
        if (el) {
          el.hidden = false;
          el.textContent = t('doacao.paypal.successMonthly');
        }
        recordPaypalDonation(data.subscriptionID || '', 'monthly');
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
        renderPage(res.j);
      })
      .catch(function () {
        document.getElementById('campanha-root').innerHTML =
          '<div class="container"><p class="campanhas-empty">' +
          esc(t('campanhas.error')) +
          '</div>';
      });
  }

  document.addEventListener('DOMContentLoaded', load);
  document.addEventListener('acura:langchange', function () {
    if (campaign) load();
  });
})();
