import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'public');
const out = [];

const dataCode = fs.readFileSync(path.join(root, 'js/i18n-data.js'), 'utf8');
const fn = new Function('window', `${dataCode}; return window.ACURA_I18N;`);
const ACURA_I18N = fn({});

const htmlFiles = fs.readdirSync(root).filter((f) => f.endsWith('.html'));

out.push('=== SITE AUDIT ===');
out.push(`HTML pages: ${htmlFiles.length}`);

// Missing i18n
const missingI18n = [];
for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const re = /data-i18n(?:-content|-placeholder|-aria|-title)?="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const k = m[1];
    if (!ACURA_I18N.es[k] || !ACURA_I18N.pt[k]) {
      missingI18n.push(`${file}: ${k} (es:${!!ACURA_I18N.es[k]} pt:${!!ACURA_I18N.pt[k]})`);
    }
  }
  const bodyTitle = html.match(/<body[^>]*data-i18n-title="([^"]+)"/);
  if (bodyTitle) {
    const k = bodyTitle[1];
    if (!ACURA_I18N.es[k] || !ACURA_I18N.pt[k]) {
      missingI18n.push(`${file}: body title ${k}`);
    }
  }
}
out.push(`Missing i18n keys: ${missingI18n.length}`);
missingI18n.forEach((x) => out.push('  ' + x));

// Key parity
const esOnly = Object.keys(ACURA_I18N.es).filter((k) => !ACURA_I18N.pt[k]);
const ptOnly = Object.keys(ACURA_I18N.pt).filter((k) => !ACURA_I18N.es[k]);
out.push(`ES-only keys: ${esOnly.length}`);
esOnly.slice(0, 20).forEach((k) => out.push('  ' + k));
out.push(`PT-only keys: ${ptOnly.length}`);
ptOnly.slice(0, 20).forEach((k) => out.push('  ' + k));

// Undefined in HTML
const undefinedInHtml = [];
for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  if (html.includes('>undefined<')) {
    const count = (html.match(/>undefined</g) || []).length;
    undefinedInHtml.push(`${file}: ${count} occurrences`);
  }
}
out.push(`HTML with 'undefined' text: ${undefinedInHtml.length}`);
undefinedInHtml.forEach((x) => out.push('  ' + x));

// Missing assets
const missingAssets = new Set();
for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const hrefRe = /(?:href|src)="([^"]+)"/g;
  let m;
  while ((m = hrefRe.exec(html)) !== null) {
    const url = m[1];
    if (url.startsWith('http') || url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#')) continue;
    const clean = url.split('?')[0].split('#')[0];
    const assetPath = path.join(root, clean);
    if (!fs.existsSync(assetPath)) {
      missingAssets.add(`${file}: ${url}`);
    }
  }
}
out.push(`Missing local assets: ${missingAssets.size}`);
[...missingAssets].forEach((x) => out.push('  ' + x));

// Broken internal anchors
const allIds = new Set();
for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const idRe = /id="([^"]+)"/g;
  let m;
  while ((m = idRe.exec(html)) !== null) allIds.add(m[1]);
}
const brokenAnchors = [];
for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const anchorRe = /href="#([^"]+)"/g;
  let m;
  while ((m = anchorRe.exec(html)) !== null) {
    if (!allIds.has(m[1])) {
      brokenAnchors.push(`${file}: #${m[1]}`);
    }
  }
}
out.push(`Broken same-page anchors: ${brokenAnchors.length}`);
brokenAnchors.forEach((x) => out.push('  ' + x));

// CSS version mismatch
const cssVersions = new Set();
for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const m = html.match(/style\.css\?v=(\d+)/);
  if (m) cssVersions.add(`${file}: v=${m[1]}`);
}
out.push('CSS versions:');
[...cssVersions].forEach((x) => out.push('  ' + x));

fs.writeFileSync(path.join(process.cwd(), 'audit-result.txt'), out.join('\n'), 'utf8');
console.log('Written audit-result.txt');
