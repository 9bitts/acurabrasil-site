const PLAN_CACHE = new Map();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 3;
const rateLimit = new Map();

function isLive() {
  return process.env.PAYPAL_MODE !== 'sandbox';
}

function apiBase() {
  return isLive() ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

function isConfigured() {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

function getPublicConfig() {
  return {
    enabled: isConfigured(),
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    mode: isLive() ? 'live' : 'sandbox',
  };
}

function getAllowedSiteHosts() {
  const hosts = new Set([
    (process.env.CANONICAL_HOST || 'www.acurabrasil.org').toLowerCase(),
    'acurabrasil.org',
    'www.acurabrasil.org',
    'localhost',
    '127.0.0.1',
  ]);
  return hosts;
}

function isAllowedSiteOrigin(req) {
  const allowed = getAllowedSiteHosts();
  for (const header of [req.headers.origin, req.headers.referer]) {
    if (!header) continue;
    try {
      const { hostname } = new URL(header);
      if (allowed.has(hostname.toLowerCase())) return true;
    } catch {
      /* ignore malformed header */
    }
  }
  return false;
}

async function getAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) {
    const err = new Error('PayPal not configured');
    err.code = 'PAYPAL_NOT_CONFIGURED';
    throw err;
  }

  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('PayPal token error:', res.status, body);
    const err = new Error(`PayPal token ${res.status}`);
    err.code = 'PAYPAL_TOKEN_FAILED';
    throw err;
  }

  const data = await res.json();
  return data.access_token;
}

async function paypalFetch(path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('PayPal API error:', path, res.status, body);
    const err = new Error(`PayPal API ${res.status}`);
    err.code = 'PAYPAL_API_FAILED';
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

function validateAmount(raw) {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 5 || amount > 50_000) {
    return null;
  }
  return Math.round(amount * 100) / 100;
}

async function createSubscriptionPlan(amount, cause, campaignLabel) {
  const cacheKey = `${amount}:${cause}:${campaignLabel || ''}`;
  if (PLAN_CACHE.has(cacheKey)) {
    return PLAN_CACHE.get(cacheKey);
  }

  const causeLabel =
    cause === 'pesquisa' ? 'Pesquisa Científica ACURABRASIL' : 'Atendimento Humanitário ACURABRASIL';
  const campaignPart = campaignLabel ? ` — ${campaignLabel}` : '';
  const value = amount.toFixed(2);

  const product = await paypalFetch('/v1/catalogs/products', {
    method: 'POST',
    body: JSON.stringify({
      name: `Doação Mensal ACURABRASIL — ${causeLabel}${campaignPart}`.slice(0, 127),
      description: `Doação recorrente mensal de R$ ${value} para ACURABRASIL (OSCIP)${campaignPart}`.slice(
        0,
        127
      ),
      type: 'SERVICE',
      category: 'CHARITY',
    }),
  });

  const plan = await paypalFetch('/v1/billing/plans', {
    method: 'POST',
    body: JSON.stringify({
      product_id: product.id,
      name: `ACURABRASIL Mensal R$ ${value}`.slice(0, 127),
      description: `Doação mensal R$ ${value} — ${causeLabel}${campaignPart}`.slice(0, 127),
      billing_cycles: [
        {
          frequency: { interval_unit: 'MONTH', interval_count: 1 },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: { value, currency_code: 'BRL' },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3,
      },
    }),
  });

  await paypalFetch(`/v1/billing/plans/${plan.id}/activate`, {
    method: 'POST',
    body: JSON.stringify({}),
  });

  PLAN_CACHE.set(cacheKey, plan.id);
  return plan.id;
}

function isRateLimited(ip) {
  const now = Date.now();
  let entry = rateLimit.get(ip);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    entry = { count: 0, windowStart: now };
  }
  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    rateLimit.set(ip, entry);
    return true;
  }
  entry.count += 1;
  rateLimit.set(ip, entry);
  if (rateLimit.size > 10_000) {
    for (const [key, value] of rateLimit) {
      if (now - value.windowStart >= RATE_LIMIT_WINDOW_MS) rateLimit.delete(key);
    }
  }
  return false;
}

function handlePaypalConfig(_req, res) {
  res.json(getPublicConfig());
}

async function handleSubscriptionPlan(req, res) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'rate_limit' });
  }

  if (!isAllowedSiteOrigin(req)) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }

  if (!isConfigured()) {
    return res.status(503).json({ ok: false, error: 'unavailable' });
  }

  const amount = validateAmount(req.body?.amount);
  const cause = req.body?.cause === 'pesquisa' ? 'pesquisa' : 'humanitaria';
  const campaignLabel = String(req.body?.campaignLabel || '')
    .replace(/[\r\n]/g, ' ')
    .trim()
    .slice(0, 80);

  if (!amount) {
    return res.status(400).json({ ok: false, error: 'validation' });
  }

  try {
    const planId = await createSubscriptionPlan(amount, cause, campaignLabel);
    return res.json({ ok: true, planId });
  } catch (err) {
    console.error('PayPal subscription plan failed:', err.code || err.message);
    return res.status(500).json({ ok: false, error: 'plan_failed' });
  }
}

function logPaypalOnStartup() {
  if (!isConfigured()) {
    console.warn('PayPal: set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to enable donations');
    return;
  }
  console.log(`PayPal: configured (${isLive() ? 'live' : 'sandbox'})`);
}

module.exports = {
  handlePaypalConfig,
  handleSubscriptionPlan,
  logPaypalOnStartup,
};
