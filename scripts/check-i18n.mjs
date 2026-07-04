import fs from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), 'public');
const esCode = fs.readFileSync(path.join(dir, 'js/i18n-es.js'), 'utf8');
const ptCode = fs.readFileSync(path.join(dir, 'js/i18n-pt.js'), 'utf8');
const esFn = new Function('window', `${esCode}; return window.ACURA_I18N_ES;`);
const ptFn = new Function('window', `${ptCode}; return window.ACURA_I18N_PT;`);
const ACURA_I18N = { es: esFn({}), pt: ptFn({}) };

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
if (missing.length > 0) process.exit(1);
