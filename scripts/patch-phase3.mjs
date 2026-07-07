import fs from 'fs';
import path from 'path';

const publicDir = path.join(process.cwd(), 'public');
const files = fs.readdirSync(publicDir).filter((f) => f.endsWith('.html'));

const NAV_VOL = `                            <li><a href="voluntarios.html" data-i18n="nav.volunteers">Voluntariado profesional</a></li>
`;

const FOOTER_VOL = `                    <li><a href="voluntarios.html" data-i18n="footer.volunteers">Voluntariado</a></li>
`;

const NEWSLETTER = `
        <div class="footer-newsletter">
            <div class="container footer-newsletter-inner">
                <div class="footer-newsletter-copy">
                    <h3 data-i18n="footer.newsletter.title">Boletín AcuraBrasil</h3>
                    <p data-i18n="footer.newsletter.text">Reciba noticias sobre proyectos humanitarios, transparencia y formas de ayudar.</p>
                </div>
                <form class="footer-newsletter-form" action="/api/newsletter" method="post" novalidate>
                    <div class="form-honeypot" aria-hidden="true">
                        <label for="newsletter-website">Website</label>
                        <input type="text" id="newsletter-website" name="website" tabindex="-1" autocomplete="off">
                    </div>
                    <div class="footer-newsletter-fields">
                        <input type="text" name="nome" required maxlength="120" data-i18n-placeholder="footer.newsletter.nomePlaceholder" placeholder="Su nombre" aria-label="Nombre">
                        <input type="email" name="email" required maxlength="254" data-i18n-placeholder="footer.newsletter.emailPlaceholder" placeholder="su@email.com" aria-label="Email">
                        <button type="submit" class="btn btn-verde" data-i18n="footer.newsletter.submit">Suscribirse</button>
                    </div>
                    <label class="footer-newsletter-consent">
                        <input type="checkbox" name="privacidade" required value="on">
                        <span data-i18n="footer.newsletter.privacy" data-i18n-html>Autorizo el tratamiento de mis datos conforme a la <a href="privacidade.html">Política de Privacidad</a>.</span>
                    </label>
                    <p class="footer-newsletter-status" role="status" aria-live="polite" hidden></p>
                </form>
            </div>
        </div>
`;

for (const file of files) {
  let html = fs.readFileSync(path.join(publicDir, file), 'utf8');
  let changed = false;

  if (!html.includes('href="voluntarios.html"')) {
    html = html.replace(
      /(<li><a href="transparencia\.html" data-i18n="nav\.transparency">[^<]+<\/a><\/li>\n)/,
      `$1${NAV_VOL}`
    );
    html = html.replace(
      /(<li><a href="contato\.html" data-i18n="footer\.contactLink">[^<]+<\/a><\/li>\n)/,
      `${FOOTER_VOL}$1`
    );
    changed = true;
  }

  if (!html.includes('footer-newsletter')) {
    html = html.replace(/(\s*<div class="footer-bottom">)/, `${NEWSLETTER}$1`);
    changed = true;
  }

  if (!html.includes('js/newsletter.js') && html.includes('js/analytics.js')) {
    html = html.replace(
      '<script src="js/analytics.js"></script>',
      '<script src="js/analytics.js"></script>\n    <script src="js/newsletter.js?v=16"></script>'
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(path.join(publicDir, file), html, 'utf8');
    console.log('patched', file);
  }
}

// sitemap
const sitemapPath = path.join(publicDir, 'sitemap.xml');
let sitemap = fs.readFileSync(sitemapPath, 'utf8');
if (!sitemap.includes('voluntarios.html')) {
  sitemap = sitemap.replace(
    '</urlset>',
    `  <url>
    <loc>https://www.acurabrasil.org/voluntarios.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.85</priority>
  </url>
</urlset>`
  );
  fs.writeFileSync(sitemapPath, sitemap, 'utf8');
  console.log('patched sitemap.xml');
}

console.log('Phase 3 patch done');
