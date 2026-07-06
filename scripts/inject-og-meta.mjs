import fs from 'fs';
import path from 'path';

const SITE = 'https://www.acurabrasil.org';
const OG_IMAGE = `${SITE}/img/og-share.png`;
const publicDir = path.join(process.cwd(), 'public');

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function pageUrl(filename) {
  const slug = filename.replace(/\.html$/i, '');
  if (slug === 'index') return `${SITE}/`;
  return `${SITE}/${slug}`;
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() : 'ACURABRASIL';
}

function extractDescription(html) {
  const match = html.match(/<meta\s+name="description"[^>]*content="([^"]*)"/i);
  return match ? match[1].trim() : '';
}

function buildOgBlock({ title, description, url }) {
  const lines = [
    '    <meta property="og:type" content="website">',
    '    <meta property="og:site_name" content="ACURABRASIL">',
    `    <meta property="og:title" content="${escapeAttr(title)}">`,
    `    <meta property="og:description" content="${escapeAttr(description)}">`,
    `    <meta property="og:url" content="${url}">`,
    `    <meta property="og:image" content="${OG_IMAGE}">`,
    '    <meta property="og:image:width" content="500">',
    '    <meta property="og:image:height" content="500">',
    '    <meta property="og:image:alt" content="ACURABRASIL">',
    '    <meta property="og:image:type" content="image/png">',
    '    <meta name="twitter:card" content="summary">',
    `    <meta name="twitter:title" content="${escapeAttr(title)}">`,
    `    <meta name="twitter:description" content="${escapeAttr(description)}">`,
    `    <meta name="twitter:image" content="${OG_IMAGE}">`,
  ];
  return lines.join('\n') + '\n';
}

const files = fs
  .readdirSync(publicDir)
  .filter((f) => f.endsWith('.html'));

for (const file of files) {
  const filePath = path.join(publicDir, file);
  let html = fs.readFileSync(filePath, 'utf8');
  if (html.includes('property="og:image"')) continue;

  const block = buildOgBlock({
    title: extractTitle(html),
    description: extractDescription(html),
    url: pageUrl(file),
  });

  if (html.includes('<meta name="description"')) {
    html = html.replace(
      /(<meta name="description"[^>]*>\r?\n)/i,
      `$1${block}`
    );
  } else if (html.includes('<title>')) {
    html = html.replace(/(<title>[^<]*<\/title>\r?\n)/i, `$1${block}`);
  } else {
    html = html.replace(/(<meta name="viewport"[^>]*>\r?\n)/i, `$1${block}`);
  }

  if (!html.includes('property="og:image"')) {
    console.warn('skipped (no anchor match):', file);
    continue;
  }

  fs.writeFileSync(filePath, html, 'utf8');
  console.log('injected og meta:', file);
}
