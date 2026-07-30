const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acura-mc-'));
const dbPath = path.join(tmpDir, 'test.db');
process.env.DATA_PATH = dbPath;

const { closeDbForTests, getDb } = require('../lib/db');
const {
  validateRegistrationBody,
  handleMasterclassRegister,
  listRegistrations,
  updateRegistration,
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

    const ok = validateRegistrationBody({
      nome: 'Maria Silva',
      email: 'maria@example.com',
      whatsapp: '(11) 98888-7777',
      profissao: 'Psicóloga',
      aluno_meire: 'sim',
      relacao: 'voluntario',
      codigo_carteirinha: 'ACURA-123',
      privacidade: true,
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.data.whatsapp, '11988887777');
    assert.equal(ok.data.profissao, 'Psicóloga');
    assert.equal(ok.data.aluno_meire, 'sim');
    assert.equal(ok.data.codigo_carteirinha, 'ACURA-123');
  });

  it('silently accepts honeypot', () => {
    const res = validateRegistrationBody({ website: 'spam', nome: 'x' });
    assert.equal(res.ok, false);
    assert.equal(res.silent, true);
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
        codigo_carteirinha: '',
        mensagem: 'Quero ajudar',
        privacidade: true,
        marketing: true,
      },
    };
    const res = mockRes();
    await handleMasterclassRegister(req, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.needsVolunteerReview, true);

    const list = listRegistrations({ q: 'joao.mc@example.com' });
    assert.equal(list.length, 1);
    assert.equal(list[0].relacao, 'quero_voluntariar');
    assert.equal(list[0].profissao, 'Enfermeiro');
    assert.equal(list[0].aluno_meire, 'nao');
    assert.equal(list[0].marketing, 1);

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
      privacidade: true,
    };
    const res = mockRes();
    await handleMasterclassRegister({ ip: '127.0.0.2', body }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'already_registered');
  });
});
