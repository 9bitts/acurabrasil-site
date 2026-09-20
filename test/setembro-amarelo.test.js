const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildSetembroAmareloLinks, buildOutubroRosaLinks } = require('../lib/utm-links');

describe('setembro amarelo utm links', () => {
  it('tags Doctor8 and landing URLs with setembro-amarelo', () => {
    const links = buildSetembroAmareloLinks('https://www.acurabrasil.org', 'acurabrasil');
    assert.match(links.solicitud, /utm_campaign=setembro-amarelo/);
    assert.match(links.solicitud, /setembroamarelo/);
    assert.match(links.solicitud, /#pagar/);
    assert.match(links.landing, /\/setembroamarelo/);
    assert.match(links.landing, /utm_campaign=setembro-amarelo/);
    assert.match(links.professional, /register\/professional\/signup/);
    assert.match(links.professional, /utm_content=profissional/);
  });
});

describe('outubro rosa utm links', () => {
  it('tags Doctor8 and landing URLs with outubro-rosa', () => {
    const links = buildOutubroRosaLinks('https://www.acurabrasil.org', 'acurabrasil');
    assert.match(links.solicitud, /utm_campaign=outubro-rosa/);
    assert.match(links.solicitud, /atendimentohumanitario/);
    assert.match(links.landing, /\/outubrorosa/);
    assert.match(links.landing, /utm_campaign=outubro-rosa/);
    assert.match(links.professional, /utm_content=profissional/);
  });
});

describe('setembro amarelo social-care form', () => {
  it('collects the paid request on the landing instead of sending people to humanitarian intake', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/setembroamarelo.html'), 'utf8');
    assert.match(html, /id="sa-social-care-form"/);
    assert.match(html, /id="pagar"/);
    assert.match(html, /js\/social-care-checkout\.js/);
    assert.match(html, /Pagar R\$ 100/);
    assert.doesNotMatch(html, /app\.doctor8\.org\/atendimentohumanitario/);
  });
});
