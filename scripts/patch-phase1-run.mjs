import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(publicDir).filter((f) => f.endsWith('.html'));

const NAV =
  '                    <li><a href="doacao.html" class="nav-link nav-link-donate" data-i18n="nav.donate">Donar</a></li>\n';
const HEAD =
  '    <script src="js/analytics-config.js"></script>\n    <script src="js/seo.js"></script>\n';
const FOOT =
  '    <script src="js/cookie-consent.js"></script>\n    <script src="js/analytics.js"></script>\n';
const PRIV =
  '                    <li><a href="privacidade.html" data-i18n="footer.privacy">Política de Privacidad</a></li>\n';

for (const file of files) {
  const fp = path.join(publicDir, file);
  let html = fs.readFileSync(fp, 'utf8');
  let changed = false;

  if (!html.includes('nav-link-donate')) {
    html = html.replace(
      /(<li><a href="consulta-venezuela\.html" class="nav-link nav-link-destaque"[^>]*>[\s\S]*?<\/a><\/li>\n)/,
      `$1${NAV}`
    );
    html = html.replace(/\s*<li><a href="doacao\.html" data-i18n="nav\.donate">[^<]*<\/a><\/li>\n/g, '\n');
    changed = true;
  }

  if (!html.includes('analytics-config.js')) {
    html = html.replace(/(<link rel="stylesheet" href="css\/style\.css[^"]*">\n)/, `$1${HEAD}`);
    changed = true;
  }

  if (!html.includes('cookie-consent.js')) {
    if (html.includes('<script src="js/main.js"></script>\n')) {
      html = html.replace('<script src="js/main.js"></script>\n', `<script src="js/main.js"></script>\n${FOOT}`);
    } else {
      html = html.replace('</body>', `${FOOT}</body>`);
    }
    changed = true;
  }

  if (!html.includes('footer.privacy')) {
    html = html.replace(
      /(<li><a href="transparencia\.html" data-i18n="footer\.portal">[^<]*<\/a><\/li>\n)/,
      `$1${PRIV}`
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(fp, html);
    process.stdout.write(`patched ${file}\n`);
  }
}
