const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildSetembroAmareloLinks } = require('../lib/utm-links');

describe('setembro amarelo utm links', () => {
  it('tags Doctor8 and landing URLs with setembro-amarelo', () => {
    const links = buildSetembroAmareloLinks('https://www.acurabrasil.org', 'acurabrasil');
    assert.match(links.solicitud, /utm_campaign=setembro-amarelo/);
    assert.match(links.solicitud, /atendimentohumanitario/);
    assert.match(links.landing, /\/setembroamarelo/);
    assert.match(links.landing, /utm_campaign=setembro-amarelo/);
    assert.match(links.professional, /register\/professional\/signup/);
    assert.match(links.professional, /utm_content=profissional/);
  });
});
