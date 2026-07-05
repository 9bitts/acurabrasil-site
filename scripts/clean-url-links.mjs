import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

const INTERNAL_PAGES = [
  'index',
  'instituicao',
  'equipe',
  'pesquisas',
  'atendimento-pandemia',
  'sos-saude-rs',
  'sos-venezuela',
  'consulta-venezuela',
  'solicitud-sos-venezuela',
  'doacao',
  'transparencia',
  'contato',
  'associar',
  'privacidade',
  'voluntarios',
  'newsletter-confirm',
];

function cleanPath(page) {
  return page === 'index' ? '/' : `/${page}`;
}

function cleanInternalLinks(text) {
  let result = text;
  const sorted = [...INTERNAL_PAGES].sort((a, b) => b.length - a.length);

  for (const page of sorted) {
    const escaped = page.replace(/-/g, '\\-');
    const target = cleanPath(page);

    result = result.replace(
      new RegExp(`href="\\/?${escaped}\\.html`, 'g'),
      `href="${target}`
    );
    result = result.replace(
      new RegExp(`href='\\/?${escaped}\\.html`, 'g'),
      `href='${target}`
    );
    result = result.replace(
      new RegExp(`href=\\\\"\\/?${escaped}\\.html`, 'g'),
      `href=\\"${target}`
    );
    result = result.replace(
      new RegExp(`(location\\.href\\s*=\\s*['"])\\/?${escaped}\\.html`, 'g'),
      `$1${target}`
    );
    result = result.replace(
      new RegExp(`(redirect\\([^,]+,\\s*['"])\\/?${escaped}\\.html`, 'g'),
      `$1${target}`
    );
    result = result.replace(
      new RegExp(`(['"])\\/?${escaped}\\.html\\1`, 'g'),
      `$1${target}$1`
    );
    result = result.replace(
      new RegExp(`https://www\\.acurabrasil\\.org/${escaped}\\.html`, 'g'),
      `https://www.acurabrasil.org${target === '/' ? '' : target}`
    );
  }

  return result;
}

function walkHtmlFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'admin') continue;
      walkHtmlFiles(full, files);
    } else if (entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

const targets = [
  ...walkHtmlFiles(path.join(ROOT, 'public')),
  path.join(ROOT, 'public', 'js', 'i18n-data.js'),
  path.join(ROOT, 'public', 'js', 'i18n-pt.js'),
  path.join(ROOT, 'public', 'js', 'i18n-es.js'),
  path.join(ROOT, 'public', 'js', 'volunteer-terms-content.js'),
  path.join(ROOT, 'public', 'js', 'cookie-consent.js'),
  path.join(ROOT, 'lib', 'newsletter.js'),
  path.join(ROOT, 'lib', 'utm-links.js'),
  path.join(ROOT, 'lib', 'db.js'),
  path.join(ROOT, 'public', 'sitemap.xml'),
];

let updated = 0;
for (const filePath of targets) {
  if (!fs.existsSync(filePath)) continue;
  const before = fs.readFileSync(filePath, 'utf8');
  const after = cleanInternalLinks(before);
  if (after !== before) {
    fs.writeFileSync(filePath, after);
    updated++;
    console.log('Updated:', path.relative(ROOT, filePath));
  }
}

console.log(`Done: ${updated} files`);
