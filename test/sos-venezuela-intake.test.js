const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const {
  validateBody,
  normalizeEmail,
  rateLimitKey,
  isIpRateLimited,
  isEmailIpRateLimited,
  handleSosVenezuelaIntakeRequest,
  parseVenezuelaWhatsApp,
  resolvePhoneFromBody,
  resolveUbicacionFromBody,
  buildPatientConfirmationContent,
  firePatientConfirmationEmail,
  _resetRateLimitsForTests,
  MIN_FILL_MS,
  IP_RATE_LIMIT_MAX,
} = require('../lib/sos-venezuela-intake');

function validBody(overrides = {}) {
  return {
    nome: 'María López',
    email: 'maria@example.com',
    whatsapp: '04141234567',
    estado: 'distrito-capital',
    ciudad: 'Caracas',
    relacion: 'paciente',
    tipo_atencion: 'medica',
    prioridad: 'regular',
    sintomas: 'Dolor de cabeza persistente',
    consentimiento: true,
    lgpd_privacidade: true,
    form_started_at: Date.now() - MIN_FILL_MS - 1000,
    ...overrides,
  };
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('SOS Venezuela intake', () => {
  beforeEach(() => {
    _resetRateLimitsForTests();
  });

  describe('validateBody', () => {
    it('rejects honeypot silently', () => {
      const result = validateBody(validBody({ website: 'spam-bot.com' }));
      assert.equal(result.ok, false);
      assert.equal(result.silent, true);
      assert.equal(result.reason, 'honeypot');
    });

    it('rejects submissions faster than MIN_FILL_MS', () => {
      const result = validateBody(validBody({ form_started_at: Date.now() }));
      assert.equal(result.ok, false);
      assert.equal(result.silent, true);
      assert.equal(result.reason, 'timing');
    });

    it('accepts valid body after minimum fill time', () => {
      const result = validateBody(validBody());
      assert.equal(result.ok, true);
      assert.match(result.data.protocolo, /^SOS-VE-/);
    });

    it('parses client_request_id UUID when present', () => {
      const id = crypto.randomUUID();
      const result = validateBody(validBody({ client_request_id: id }));
      assert.equal(result.ok, true);
      assert.equal(result.data.clientRequestId, id);
    });

    it('ignores invalid client_request_id', () => {
      const result = validateBody(validBody({ client_request_id: 'not-a-uuid' }));
      assert.equal(result.ok, true);
      assert.equal(result.data.clientRequestId, null);
    });

    it('accepts legacy ubicacion without estado/ciudad', () => {
      const body = validBody();
      delete body.estado;
      delete body.ciudad;
      body.ubicacion = 'Valencia, Carabobo';
      const result = validateBody(body);
      assert.equal(result.ok, true);
      assert.equal(result.data.ubicacion, 'Valencia, Carabobo');
    });
  });

  describe('parseVenezuelaWhatsApp', () => {
    it('parses common Venezuelan formats', () => {
      const cases = [
        ['04141234567', { ddd: '414', telefone: '1234567' }],
        ['4141234567', { ddd: '414', telefone: '1234567' }],
        ['+584141234567', { ddd: '414', telefone: '1234567' }],
        ['0414 123 45 67', { ddd: '414', telefone: '1234567' }],
      ];
      for (const [input, expected] of cases) {
        const parsed = parseVenezuelaWhatsApp(input);
        assert.ok(parsed, input);
        assert.equal(parsed.ddi, '58');
        assert.equal(parsed.ddd, expected.ddd, input);
        assert.equal(parsed.telefone, expected.telefone, input);
      }
    });

    it('rejects invalid numbers', () => {
      assert.equal(parseVenezuelaWhatsApp('123'), null);
      assert.equal(parseVenezuelaWhatsApp(''), null);
    });
  });

  describe('resolveUbicacionFromBody', () => {
    it('combines ciudad and estado slug into ubicacion', () => {
      const ubicacion = resolveUbicacionFromBody({
        ciudad: 'Caracas',
        estado: 'distrito-capital',
      });
      assert.equal(ubicacion, 'Caracas, Distrito Capital');
    });
  });

  describe('rate limits', () => {
    it('uses different keys for same IP with different emails', () => {
      const ip = '203.0.113.10';
      const keyA = rateLimitKey(ip, 'a@example.com');
      const keyB = rateLimitKey(ip, 'b@example.com');
      assert.notEqual(keyA, keyB);
    });

    it('normalizes email case for rate limit key', () => {
      assert.equal(normalizeEmail('  Test@Example.COM '), 'test@example.com');
      assert.equal(
        rateLimitKey('1.2.3.4', 'A@x.com'),
        rateLimitKey('1.2.3.4', 'a@x.com')
      );
    });

    it('allows different emails on same IP within email+IP window', () => {
      const ip = '198.51.100.1';
      assert.equal(isEmailIpRateLimited(ip, 'one@example.com'), false);
      assert.equal(isEmailIpRateLimited(ip, 'one@example.com'), true);
      assert.equal(isEmailIpRateLimited(ip, 'two@example.com'), false);
    });

    it('blocks same email+IP within RATE_LIMIT_MS', () => {
      const ip = '198.51.100.2';
      assert.equal(isEmailIpRateLimited(ip, 'same@example.com'), false);
      assert.equal(isEmailIpRateLimited(ip, 'same@example.com'), true);
    });

    it('blocks IP after IP_RATE_LIMIT_MAX requests per minute', () => {
      const ip = '203.0.113.99';
      for (let i = 0; i < IP_RATE_LIMIT_MAX; i += 1) {
        assert.equal(isIpRateLimited(ip), false);
      }
      assert.equal(isIpRateLimited(ip), true);
    });
  });

  describe('patient confirmation email', () => {
    it('builds Spanish confirmation with protocolo, Doctor8 link and WhatsApp', () => {
      const content = buildPatientConfirmationContent({
        nome: 'María López',
        email: 'maria@example.com',
        protocolo: 'SOS-VE-20260713-ABCDEFGHJK',
      });
      assert.match(content.subject, /SOS-VE-20260713-ABCDEFGHJK/);
      assert.match(content.text, /María López/);
      assert.match(content.text, /SOS-VE-20260713-ABCDEFGHJK/);
      assert.match(content.text, /Doctor8/);
      assert.match(content.text, /app\.doctor8\.org\/register/);
      assert.match(content.text, /911 \(VEN-911\)/);
      assert.match(content.text, /wa\.me\//);
      assert.match(content.text, /24 horas/);
    });
  });

  describe('handleSosVenezuelaIntakeRequest', () => {
    let tmpDbPath;

    before(() => {
      tmpDbPath = path.join(os.tmpdir(), `acura-sos-test-${Date.now()}.db`);
      process.env.DATA_PATH = tmpDbPath;
      process.env.NODE_ENV = 'test';
      delete process.env.RESEND_API_KEY;
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
    });

    after(() => {
      const { closeDbForTests } = require('../lib/db');
      closeDbForTests();
      if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
      delete process.env.DATA_PATH;
    });

    it('returns success with intakeToken null when only email path succeeds (no DB)', async () => {
      const storePath = require.resolve('../lib/sos-intake-store');
      const original = require(storePath);
      const mod = require.cache[storePath];
      const backup = mod.exports.persistIntake;
      mod.exports.persistIntake = () => {
        throw new Error('DB down');
      };

      const prevResend = process.env.RESEND_API_KEY;
      process.env.RESEND_API_KEY = 'test-key';

      const intake = require('../lib/sos-venezuela-intake');
      const originalFetch = global.fetch;
      global.fetch = async () => ({ ok: true });

      const res = mockRes();
      await intake.handleSosVenezuelaIntakeRequest(
        { ip: '10.0.0.1', body: validBody(), socket: {} },
        res
      );

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.ok, true);
      assert.match(res.body.protocolo, /^SOS-VE-/);
      assert.equal(res.body.intakeToken, null);

      mod.exports.persistIntake = backup;
      global.fetch = originalFetch;
      if (prevResend) process.env.RESEND_API_KEY = prevResend;
      else delete process.env.RESEND_API_KEY;
    });

    it('returns existing protocolo for duplicate client_request_id without second insert', async () => {
      const { getDb, closeDbForTests } = require('../lib/db');
      closeDbForTests();
      getDb();

      const clientRequestId = crypto.randomUUID();
      const body = validBody({ client_request_id: clientRequestId, email: 'idempotent@example.com' });

      const res1 = mockRes();
      await handleSosVenezuelaIntakeRequest({ ip: '10.0.0.2', body, socket: {} }, res1);
      assert.equal(res1.body.ok, true);
      assert.match(res1.body.protocolo, /^SOS-VE-/);

      const countAfterFirst = getDb()
        .prepare('SELECT COUNT(*) AS c FROM sos_intakes WHERE client_request_id = ?')
        .get(clientRequestId).c;
      assert.equal(countAfterFirst, 1);

      const res2 = mockRes();
      await handleSosVenezuelaIntakeRequest({ ip: '10.0.0.2', body, socket: {} }, res2);
      assert.equal(res2.body.ok, true);
      assert.equal(res2.body.protocolo, res1.body.protocolo);
      assert.equal(res2.body.intakeToken, null);

      const countAfterSecond = getDb()
        .prepare('SELECT COUNT(*) AS c FROM sos_intakes WHERE client_request_id = ?')
        .get(clientRequestId).c;
      assert.equal(countAfterSecond, 1);
    });

    it('discards honeypot with ok:true and no protocolo', async () => {
      const res = mockRes();
      await handleSosVenezuelaIntakeRequest(
        { ip: '10.0.0.3', body: validBody({ website: 'filled-by-autofill' }), socket: {} },
        res
      );
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.protocolo, undefined);
    });
  });
});
