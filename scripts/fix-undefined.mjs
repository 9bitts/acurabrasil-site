import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'public');
const dataCode = fs.readFileSync(path.join(root, 'js/i18n-data.js'), 'utf8');
const fn = new Function('window', `${dataCode}; return window.ACURA_I18N;`);
const { es } = fn({});

const htmlFiles = fs.readdirSync(root).filter((f) => f.endsWith('.html'));
let totalFixed = 0;

for (const file of htmlFiles) {
  const filePath = path.join(root, file);
  let html = fs.readFileSync(filePath, 'utf8');
  let fixed = 0;

  html = html.replace(
    /(<[^>]+data-i18n="([^"]+)"[^>]*>)undefined(<\/[^>]+>)/g,
    (match, openTag, key, closeTag) => {
      const value = es[key];
      if (!value || value.includes('<')) return match;
      fixed++;
      return `${openTag}${value}${closeTag}`;
    }
  );

  html = html.replace(/style\.css\?v=7/g, 'style.css?v=8');

  if (fixed > 0 || file !== 'sos-venezuela.html') {
    fs.writeFileSync(filePath, html, 'utf8');
  }
  totalFixed += fixed;
  if (fixed) console.log(`${file}: fixed ${fixed} undefined placeholders`);
}

console.log(`Total fixed: ${totalFixed}`);
