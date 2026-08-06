const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acura-mc-'));
const dbPath = path.join(tmpDir, 'test.db');
process.env.DATA_PATH = dbPath;
delete process.env.RESEND_API_KEY;
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
delete process.env.DOCTOR8_API_BASE_URL;
delete process.env.DOCTOR8_API_KEY;
process.env.MASTERCLASS_EFT_WHATSAPP_GROUP_URL = 'https://chat.whatsapp.com/TestGroupLink';

const { closeDbForTests, getDb } = require('../lib/db');
const {
  validateRegistrationBody,
  handleMasterclassRegister,
  listRegistrations,
  updateRegistration,
  approveRegistration,
  rejectRegistration,
  sendManualEmail,
  validateAttachment,
  buildConfirmationEmail,
  lookupDoctor8ForRegistration,
} = require('../lib/masterclass-eft');

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

const baseValid = {
  nome: 'Maria Silva',
  email: 'maria@example.com',
  whatsapp: '(11) 98888-7777',
  profissao: 'Psicóloga',
  aluno_meire: 'sim',
  relacao: 'voluntario',
  codigo_carteirinha: 'EFTAVATAR',
  privacidade: true,
  termo_confidencialidade: true,
  termo_imagem: true,
};

describe('masterclass EFT registration', () => {
  before(() => {
    getDb();
  });

  after(() => {
    closeDbForTests();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('validates required fields', () => {
    const bad = validateRegistrationBody({});
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'nome_required');

    const missingCode = validateRegistrationBody({
      ...baseValid,
      codigo_carteirinha: '',
    });
    assert.equal(missingCode.ok, false);
    assert.equal(missingCode.error, 'codigo_required');

    const missingTerm = validateRegistrationBody({
      ...baseValid,
      termo_confidencialidade: false,
    });
    assert.equal(missingTerm.ok, false);
    assert.equal(missingTerm.error, 'termo_confidencialidade_required');

    const ok = validateRegistrationBody({
      ...baseValid,
      codigo_carteirinha: 'eftavatar',
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.data.whatsapp, '11988887777');
    assert.equal(ok.data.profissao, 'Psicóloga');
    assert.equal(ok.data.aluno_meire, 'sim');
    assert.equal(ok.data.codigo_carteirinha, 'EFTAVATAR');
    assert.equal(ok.data.termo_confidencialidade, 1);
    assert.equal(ok.data.termo_imagem, 1);
  });

  it('silently accepts honeypot', () => {
    const res = validateRegistrationBody({ website: 'spam', nome: 'x' });
    assert.equal(res.ok, false);
    assert.equal(res.silent, true);
  });

  it('rejects registration when closed', async () => {
    const previous = process.env.MASTERCLASS_EFT_REGISTRATIONS_CLOSED;
    process.env.MASTERCLASS_EFT_REGISTRATIONS_CLOSED = '1';
    try {
      const res = mockRes();
      await handleMasterclassRegister({ ip: '127.0.0.9', body: { ...baseValid } }, res);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.error, 'registrations_closed');
    } finally {
      if (previous == null) {
        delete process.env.MASTERCLASS_EFT_REGISTRATIONS_CLOSED;
      } else {
        process.env.MASTERCLASS_EFT_REGISTRATIONS_CLOSED = previous;
      }
    }
  });

  it('persists registration via handler', async () => {
    const req = {
      ip: '127.0.0.1',
      body: {
        nome: 'João Voluntário',
        email: 'joao.mc@example.com',
        whatsapp: '31999998888',
        profissao: 'Enfermeiro',
        aluno_meire: 'nao',
        relacao: 'quero_voluntariar',
        codigo_carteirinha: 'ACURA-123',
        mensagem: 'Quero ajudar',
        privacidade: true,
        termo_confidencialidade: true,
        termo_imagem: true,
      },
    };
    const res = mockRes();
    await handleMasterclassRegister(req, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.needsVolunteerReview, true);
    assert.equal(res.body.awaitsConfirmation, true);

    const list = listRegistrations({ q: 'joao.mc@example.com' });
    assert.equal(list.length, 1);
    assert.equal(list[0].relacao, 'quero_voluntariar');
    assert.equal(list[0].profissao, 'Enfermeiro');
    assert.equal(list[0].aluno_meire, 'nao');
    assert.equal(list[0].codigo_carteirinha, 'ACURA-123');
    assert.equal(list[0].termo_confidencialidade, 1);
    assert.equal(list[0].termo_imagem, 1);
    assert.equal(list[0].termos_versao, '2026-07-eft');
    assert.ok(list[0].termos_aceitos_em);
    assert.equal(list[0].ip, '127.0.0.1');
    assert.equal(list[0].marketing, 0);

    const updated = updateRegistration(list[0].id, {
      status: 'confirmada',
      admin_notes: 'OK',
    });
    assert.equal(updated.status, 'confirmada');
    assert.equal(updated.admin_notes, 'OK');
  });

  it('rejects duplicate active registration', async () => {
    const body = {
      nome: 'João Voluntário',
      email: 'joao.mc@example.com',
      whatsapp: '31999998888',
      profissao: 'Enfermeiro',
      aluno_meire: 'nao',
      relacao: 'voluntario',
      codigo_carteirinha: 'EFTAVATAR',
      privacidade: true,
      termo_confidencialidade: true,
      termo_imagem: true,
    };
    const res = mockRes();
    await handleMasterclassRegister({ ip: '127.0.0.2', body }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'already_registered');
  });

  it('validates attachments', () => {
    const badType = validateAttachment({
      filename: 'x.exe',
      contentType: 'application/octet-stream',
      contentBase64: Buffer.from('hi').toString('base64'),
    });
    assert.equal(badType.ok, false);
    assert.equal(badType.error, 'attachment_type');

    const ok = validateAttachment({
      filename: 'certificado.pdf',
      contentType: 'application/pdf',
      contentBase64: Buffer.from('%PDF-1.4').toString('base64'),
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.attachment.filename, 'certificado.pdf');
  });

  it('builds confirmation email with group link', () => {
    const mail = buildConfirmationEmail(
      { nome: 'Ana' },
      'https://chat.whatsapp.com/TestGroupLink'
    );
    assert.match(mail.subject, /confirmada/i);
    assert.match(mail.text, /Ana/);
    assert.match(mail.text, /chat\.whatsapp\.com\/TestGroupLink/);
  });

  it('approves and rejects registrations', async () => {
    const list = listRegistrations({ q: 'joao.mc@example.com' });
    assert.equal(list.length, 1);
    const id = list[0].id;

    const approved = await approveRegistration(id);
    assert.equal(approved.ok, true);
    assert.equal(approved.registration.status, 'confirmada');
    // No Resend/SMTP in test env → emailError expected, status still confirmed
    assert.equal(approved.emailSent, false);
    assert.ok(approved.emailError);
    assert.equal(approved.emailSkipped, false);

    // Without a successful send, confirmation_email_sent_at stays empty → retry allowed
    const second = await approveRegistration(id);
    assert.equal(second.ok, true);
    assert.equal(second.registration.status, 'confirmada');
    assert.equal(second.emailSkipped, false);
    assert.ok(second.emailError);

    const rejected = await rejectRegistration(id, { admin_notes: 'Fora do perfil' });
    assert.equal(rejected.ok, true);
    assert.equal(rejected.registration.status, 'recusada');
    assert.equal(rejected.registration.admin_notes, 'Fora do perfil');
  });

  it('sendManualEmail requires configured provider', async () => {
    const list = listRegistrations({ q: 'joao.mc@example.com' });
    const id = list[0].id;
    const result = await sendManualEmail(id, {
      subject: 'Teste',
      text: 'Olá, mensagem de teste.',
      attachment: {
        filename: 'nota.pdf',
        contentType: 'application/pdf',
        contentBase64: Buffer.from('%PDF').toString('base64'),
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'email_not_configured');
  });

  it('doctor8 lookup without config returns not_configured', async () => {
    const list = listRegistrations({ q: 'joao.mc@example.com' });
    const id = list[0].id;
    const result = await lookupDoctor8ForRegistration(id);
    assert.equal(result.configured, false);
    assert.equal(result.status, 'not_configured');
    assert.ok(result.registration.doctor8_checked_at);
    assert.equal(result.registration.doctor8_status, 'not_configured');
  });
});
