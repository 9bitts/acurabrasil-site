import fs from 'fs';
import path from 'path';

const src = path.join(process.cwd(), 'public/js/i18n-data.js');
const code = fs.readFileSync(src, 'utf8');
const fn = new Function('window', `${code}; return window.ACURA_I18N;`);
const data = fn({});

const outDir = path.join(process.cwd(), 'public/js');
fs.writeFileSync(
  path.join(outDir, 'i18n-es.js'),
  `window.ACURA_I18N_ES = ${JSON.stringify(data.es, null, 2)};\n`,
  'utf8'
);
fs.writeFileSync(
  path.join(outDir, 'i18n-pt.js'),
  `window.ACURA_I18N_PT = ${JSON.stringify(data.pt, null, 2)};\n`,
  'utf8'
);
console.log('Split i18n:', Object.keys(data.es).length, 'ES keys,', Object.keys(data.pt).length, 'PT keys');
