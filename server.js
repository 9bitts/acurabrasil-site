const express = require('express');
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

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://www.paypal.com https://www.sandbox.paypal.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https://images.unsplash.com https://api.qrserver.com",
      "connect-src 'self' https://www.paypal.com https://www.sandbox.paypal.com",
      "frame-src https://www.paypal.com https://www.sandbox.paypal.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  next();
});

app.use(express.json({ limit: '32kb' }));

app.post('/api/contact', handleContactRequest);
app.post('/api/sos-venezuela/intake', handleSosVenezuelaIntakeRequest);
app.post('/api/sos-venezuela/intake/:protocolo/event', handleIntakeEventRequest);
registerAdminRoutes(app);
app.get('/api/paypal/config', handlePaypalConfig);
app.post('/api/paypal/subscription-plan', handleSubscriptionPlan);

app.get(['/admin', '/admin/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public'), { redirect: false }));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ ok: false, error: 'invalid_json' });
  }
  console.error('Unhandled error:', err.message);
  return res.status(500).json({ ok: false, error: 'server_error' });
});

app.listen(PORT, () => {
  console.log(`ACURA BRASIL site running on port ${PORT}`);
  try {
    getDb();
    console.log('SOS admin DB initialized');
  } catch (err) {
    console.error('SOS admin DB init failed:', err.message);
  }
  verifyEmailOnStartup();
  logPaypalOnStartup();
});
