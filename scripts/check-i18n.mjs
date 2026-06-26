import fs from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), 'public');
const dataCode = fs.readFileSync(path.join(dir, 'js/i18n-data.js'), 'utf8');
const fn = new Function('window', `${dataCode}; return window.ACURA_I18N;`);
const ACURA_I18N = fn({});

const htmlFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
const missing = [];

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(dir, file), 'utf8');
  const re = /data-i18n(?:-content|-placeholder|-aria|-title)?="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const k = m[1];
    if (!ACURA_I18N.es[k] || !ACURA_I18N.pt[k]) {
      missing.push(`${file}: ${k} (es:${!!ACURA_I18N.es[k]} pt:${!!ACURA_I18N.pt[k]})`);
    }
  }
}

console.log(`Missing keys: ${missing.length}`);
missing.slice(0, 40).forEach((x) => console.log(x));
