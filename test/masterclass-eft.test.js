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
});
