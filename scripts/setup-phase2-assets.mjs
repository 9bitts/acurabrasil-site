import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = process.cwd();
const fontsSrc = path.join(root, 'node_modules/@fontsource/inter/files');
const fontsDst = path.join(root, 'public/fonts');
const vendorDst = path.join(root, 'public/js/vendor');
const projetosDst = path.join(root, 'public/img/projetos');
const docsDst = path.join(root, 'public/docs');

const FONT_FILES = [
  'inter-latin-400-normal.woff2',
  'inter-latin-500-normal.woff2',
  'inter-latin-600-normal.woff2',
  'inter-latin-700-normal.woff2',
];

const PLACEHOLDER_COLORS = {
  'covid.webp': '#23729d',
  'rs.webp': '#72a842',
  'venezuela.webp': '#164e6c',
  'ciencia.webp': '#5b8c33',
};

const PDF_TODO = [
  'ata-fundacao.pdf',
  'certificacao-oscip.pdf',
  'certidoes-publicas.pdf',
  'balanco-patrimonial-2024.pdf',
  'demonstracao-resultados-2024.pdf',
  'informe-conselho-fiscal-2024.pdf',
  'informe-anual-2024.pdf',
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFonts() {
  ensureDir(fontsDst);
  for (const file of FONT_FILES) {
    const src = path.join(fontsSrc, file);
    const dst = path.join(fontsDst, file);
    if (!fs.existsSync(src)) {
      console.warn('Missing font file:', src);
      continue;
    }
    fs.copyFileSync(src, dst);
    console.log('Font:', file);
  }
}

function copyQrcode() {
  ensureDir(vendorDst);
  const bundled = path.join(root, 'public/js/vendor/qrcode.min.js');
  if (fs.existsSync(bundled)) {
    console.log('qrcode.min.js already bundled');
    return;
  }
  console.warn('Run: node scripts/bundle-qrcode.mjs');
}

async function createWebpPlaceholder(name, color) {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.warn('sharp not available — skipping', name);
    return;
  }
  ensureDir(projetosDst);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560"><rect fill="${color}" width="800" height="560"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="28">ACURA BRASIL — placeholder</text></svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 80 }).toFile(path.join(projetosDst, name));
  console.log('Placeholder:', name);
}

async function createLogoWebp() {
  const png = path.join(root, 'public/img/logo-acurabrasil.png');
  if (!fs.existsSync(png)) {
    console.warn('logo-acurabrasil.png not found — skip WebP');
    return;
  }
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    return;
  }
  await sharp(png).webp({ quality: 85 }).toFile(path.join(root, 'public/img/logo-acurabrasil.webp'));
  console.log('Created logo-acurabrasil.webp');
}

function createPdfTodo() {
  ensureDir(docsDst);
  const todoPath = path.join(docsDst, 'TODO-PDFs-2024.txt');
  const lines = [
    'TODO: Subir PDFs reais referenciados em transparencia.html:',
    ...PDF_TODO.map((f) => `- ${f}`),
    '',
    'Links já apontam para estes arquivos em /docs/.',
  ];
  fs.writeFileSync(todoPath, lines.join('\n'), 'utf8');
  console.log('Wrote docs/TODO-PDFs-2024.txt');
}

ensureDir(fontsDst);
copyFonts();
copyQrcode();
createPdfTodo();
for (const [name, color] of Object.entries(PLACEHOLDER_COLORS)) {
  await createWebpPlaceholder(name, color);
}
await createLogoWebp();
