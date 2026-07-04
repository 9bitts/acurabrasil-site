const express = require('express');
const compression = require('compression');
const path = require('path');
const { handleContactRequest, verifyEmailOnStartup } = require('./lib/contact');
const { handleSosVenezuelaIntakeRequest } = require('./lib/sos-venezuela-intake');
const { handleIntakeEventRequest } = require('./lib/intake-events');
const { registerAdminRoutes } = require('./lib/admin-api');
const { getDb } = require('./lib/db');
const {
  handlePaypalConfig,
  handleSubscriptionPlan,
  logPaypalOnStartup,
} = require('./lib/paypal');
const { adminGuard, describeAdminGuardMode } = require('./lib/admin-guard');
const {
  handleNewsletterSubscribe,
  handleNewsletterConfirm,
} = require('./lib/newsletter');

const app = express();
const PORT = process.env.PORT || 3000;
const CANONICAL_HOST = process.env.CANONICAL_HOST || 'www.acurabrasil.org';

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  if (host === 'acurabrasil.org') {
    // Sitemap/robots must answer 200 on the apex host (GSC domain property fetches here).
    if (req.path === '/sitemap.xml' || req.path === '/robots.txt') {
      return next();
    }
    const target = `https://${CANONICAL_HOST}${req.originalUrl || '/'}`;
    return res.redirect(301, target);
  }
  next();
});

app.use((req, res, next) => {
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://www.paypal.com https://www.sandbox.paypal.com https://www.googletagmanager.com",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "img-src 'self' data: https://www.google-analytics.com https://images.unsplash.com https://api.qrserver.com https://static.wixstatic.com",
      "connect-src 'self' https://www.paypal.com https://www.sandbox.paypal.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com",
      "frame-src https://www.paypal.com https://www.sandbox.paypal.com https://www.youtube-nocookie.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  next();
});

app.use(express.json({ limit: '32kb' }));
app.use(compression());

app.get('/api/site-config', (req, res) => {
  res.json({
    ga4MeasurementId: process.env.GA4_MEASUREMENT_ID || 'G-ZXE5T1VCGS',
  });
});

app.post('/api/contact', handleContactRequest);
app.post('/api/newsletter', handleNewsletterSubscribe);
app.get('/api/newsletter/confirm', handleNewsletterConfirm);
app.post('/api/sos-venezuela/intake', handleSosVenezuelaIntakeRequest);
app.post('/api/sos-venezuela/intake/:protocolo/event', handleIntakeEventRequest);
registerAdminRoutes(app);
app.get('/api/paypal/config', handlePaypalConfig);
app.post('/api/paypal/subscription-plan', handleSubscriptionPlan);

app.get(['/admin', '/admin/'], adminGuard, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.use((req, res, next) => {
  if (!req.path.startsWith('/admin')) return next();
  return adminGuard(req, res, next);
});

const publicPath = path.join(__dirname, 'public');

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  res.sendFile(path.join(publicPath, 'sitemap.xml'));
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.sendFile(path.join(publicPath, 'robots.txt'));
});

app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(publicPath, 'img', 'logo-acurabrasil.png'));
});

app.use(express.static(publicPath, {
  redirect: false,
  setHeaders(res, filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    if (/\.html?$/i.test(normalized)) {
      res.setHeader('Cache-Control', 'public, max-age=0');
    } else if (/\/(css|js|fonts|img)\//.test(normalized)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ ok: false, error: 'invalid_json' });
  }
  console.error('Unhandled error:', err.message);
  return res.status(500).json({ ok: false, error: 'server_error' });
});

app.listen(PORT, () => {
  console.log(`ACURA BRASIL site running on port ${PORT}`);
  const guardMode = describeAdminGuardMode();
  if (guardMode) {
    console.log(guardMode);
  } else {
    console.warn(
      'Admin guard not configured (dev) — /admin and /api/admin are open; set CF_ACCESS_* or ADMIN_IP_ALLOWLIST in production'
    );
  }
  try {
    getDb();
    console.log('SOS admin DB initialized');
  } catch (err) {
    console.error('SOS admin DB init failed:', err.message);
  }
  verifyEmailOnStartup();
  logPaypalOnStartup();
});
