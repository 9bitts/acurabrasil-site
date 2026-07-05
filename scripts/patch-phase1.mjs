import fs from 'fs';
import path from 'path';

const publicDir = path.join(process.cwd(), 'public');
const htmlFiles = fs
  .readdirSync(publicDir)
  .filter((f) => f.endsWith('.html') && !f.startsWith('.'));

const NAV_DONATE =
  '                    <li><a href="doacao.html" class="nav-link nav-link-donate" data-i18n="nav.donate">Donar</a></li>\n';

const HEAD_SCRIPTS =
  '    <script src="js/analytics-config.js"></script>\n    <script src="js/seo.js"></script>\n';

const FOOT_SCRIPTS =
  '    <script src="js/cookie-consent.js"></script>\n    <script src="js/analytics.js"></script>\n';

const FOOTER_PRIVACY =
  '                    <li><a href="privacidade.html" data-i18n="footer.privacy">Política de Privacidad</a></li>\n';

const JSON_LD = `    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": ["NGO", "MedicalOrganization"],
      "name": "ACURABRASIL — Associação Brasil pela Cura",
      "alternateName": "ACURABRASIL",
      "taxID": "30.350.850/0001-80",
      "url": "https://www.acurabrasil.org/",
      "logo": "https://www.acurabrasil.org/img/logo-acurabrasil.png",
      "description": "Associação humanitária sem fins lucrativos — telemedicina gratuita, pesquisa científica e transparência OSCIP.",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "Rua Ulhôa Cintra, nº 32, Loja 01, Sala 01",
        "addressLocality": "Belo Horizonte",
        "addressRegion": "MG",
        "addressCountry": "BR"
      },
      "nonprofitStatus": "Nonprofit501c3",
      "areaServed": ["BR", "VE"],
      "sameAs": []
    }
    </script>
`;

for (const file of htmlFiles) {
  let html = fs.readFileSync(path.join(publicDir, file), 'utf8');
  let changed = false;

  if (!html.includes('nav-link-donate')) {
    html = html.replace(
      /(<li><a href="consulta-venezuela\.html" class="nav-link nav-link-destaque"[^>]*>[^<]*<\/a><\/li>\n)/,
      `$1${NAV_DONATE}`
    );
    html = html.replace(
      /\s*<li><a href="doacao\.html" data-i18n="nav\.donate">[^<]*<\/a><\/li>\n/g,
      '\n'
    );
    changed = true;
  }

  if (!html.includes('js/analytics-config.js')) {
    html = html.replace(/(<link rel="stylesheet" href="css\/style\.css[^"]*">\n)/, `$1${HEAD_SCRIPTS}`);
    changed = true;
  }

  if (!html.includes('js/cookie-consent.js')) {
    html = html.replace(/(<script src="js\/main\.js"><\/script>\n)/, `$1${FOOT_SCRIPTS}`);
    if (!html.includes('js/cookie-consent.js')) {
      html = html.replace(/(<\/body>\n<\/html>)/, `${FOOT_SCRIPTS}$1`);
    }
    changed = true;
  }

  if (!html.includes('footer.privacy')) {
    html = html.replace(
      /(<li><a href="transparencia\.html" data-i18n="footer\.portal">[^<]*<\/a><\/li>\n)/,
      `$1${FOOTER_PRIVACY}`
    );
    changed = true;
  }

  if (file === 'index.html' && !html.includes('application/ld+json')) {
    html = html.replace(/(<\/head>\n)/, `${JSON_LD}$1`);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(path.join(publicDir, file), html, 'utf8');
    console.log('patched', file);
  }
}

console.log('Done');
