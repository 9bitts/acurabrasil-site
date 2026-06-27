import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'public');
const replacements = [
  ['data-i18n="nav.consult">Consulta en línea<', 'data-i18n="nav.consult">Consulta en Línea<'],
  ['data-i18n="nav.about">Institución<', 'data-i18n="nav.about">La Institución<'],
  ['data-i18n="nav.research">Investigación<', 'data-i18n="nav.research">Investigaciones<'],
  ['data-i18n="nav.sosRs">SOS Saúde RS<', 'data-i18n="nav.sosRs">SOS Salud RS<'],
  ['data-i18n="nav.join">Asociarse<', 'data-i18n="nav.join">Hazte Asociado<'],
];

for (const file of fs.readdirSync(root).filter((f) => f.endsWith('.html'))) {
  const filePath = path.join(root, file);
  let html = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  for (const [from, to] of replacements) {
    if (html.includes(from)) {
      html = html.split(from).join(to);
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(filePath, html, 'utf8');
}

console.log('Nav fallbacks updated');
