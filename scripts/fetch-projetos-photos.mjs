/**
 * Baixa fotos temáticas (Unsplash, licença livre) e gera WebP para a galeria de doação.
 * Uso: node scripts/fetch-projetos-photos.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public/img/projetos');
const W = 800;
const H = 560;

/** Unsplash — uso permitido com atribuição; baixamos para self-hosting. */
const PHOTOS = {
  'covid.webp': {
    url: 'https://images.unsplash.com/photo-1758691462749-a95ce1bd7f96?w=1200&h=840&fit=crop&q=80',
    credit: 'Unsplash — telemedicina / consulta por vídeo',
  },
  'rs.webp': {
    url: 'https://images.pexels.com/photos/6647028/pexels-photo-6647028.jpeg?auto=compress&cs=tinysrgb&w=1200&h=840&fit=crop',
    credit: 'Pexels — ação humanitária / voluntariado',
  },
  'venezuela.webp': {
    url: 'https://images.unsplash.com/photo-1584515933487-779824d29309?w=1200&h=840&fit=crop&q=80',
    credit: 'Unsplash — atendimento médico humanitário',
  },
  'ciencia.webp': {
    url: 'https://images.unsplash.com/photo-1576086213369-97a306d36557?w=1200&h=840&fit=crop&q=80',
    credit: 'Unsplash — pesquisa científica em laboratório',
  },
};

async function fetchBuffer(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const credits = [];

  for (const [filename, { url, credit }] of Object.entries(PHOTOS)) {
    console.log('Fetching', filename, '…');
    const buf = await fetchBuffer(url);
    const out = path.join(outDir, filename);
    await sharp(buf)
      .resize(W, H, { fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toFile(out);
    console.log('  →', out);
    credits.push(`${filename}: ${credit}`);
  }

  const creditsPath = path.join(outDir, 'CREDITS.txt');
  fs.writeFileSync(
    creditsPath,
    [
      'Fotos ilustrativas — licença Unsplash (https://unsplash.com/license)',
      'Substituir por fotos reais dos projetos ACURABRASIL quando disponíveis.',
      '',
      ...credits,
    ].join('\n'),
    'utf8'
  );
  console.log('Credits:', creditsPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
