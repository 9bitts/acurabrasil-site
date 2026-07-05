import fs from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), 'public');
const contact = '/contato?assunto=transparencia';
const pdfRe = /href="docs\/[^"]+\.pdf"(?:\s+target="_blank")?(?:\s+rel="noopener")?/g;

let count = 0;
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
  const filePath = path.join(dir, file);
  const html = fs.readFileSync(filePath, 'utf8');
  const next = html.replace(pdfRe, `href="${contact}"`);
  if (next !== html) {
    fs.writeFileSync(filePath, next);
    count++;
    console.log('Updated:', file);
  }
}
console.log('Done:', count, 'files');
