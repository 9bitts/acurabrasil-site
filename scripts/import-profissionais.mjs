import fs from 'fs';
import path from 'path';

const csvPath = process.argv[2] || 'C:/Users/diego/Downloads/Página+Profissional.csv';
const text = fs.readFileSync(csvPath, 'utf8');

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0]) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseJsonArray(s) {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [s];
  } catch {
    return s ? [s] : [];
  }
}

function wixImageToUrl(wixUrl) {
  if (!wixUrl || !wixUrl.startsWith('wix:image://')) return null;
  const match = wixUrl.match(/wix:image:\/\/v1\/([^~]+)~mv2\.(\w+)\/([^#]+)/);
  if (!match) return null;
  const [, mediaId, ext, rawName] = match;
  const fileName = decodeURIComponent(rawName);
  return `https://static.wixstatic.com/media/${mediaId}~mv2.${ext}/${encodeURIComponent(fileName).replace(/%20/g, '%20')}`;
}

function wixDocumentToUrl(wixUrl) {
  if (!wixUrl || !wixUrl.startsWith('wix:document://')) return '';
  const match = wixUrl.match(/wix:document:\/\/v1\/(ugd\/[^/]+\.pdf)/);
  return match ? `https://static.wixstatic.com/${match[1]}` : '';
}

function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

const rows = parseCSV(text);
const headers = rows[0];
const data = rows.slice(1).map((r) => {
  const o = {};
  headers.forEach((h, i) => {
    o[h] = r[i] || '';
  });
  return o;
});

const professionals = data.map((row) => {
  const name = row.Title || row['Texto 1'] || '';
  const profissao = parseJsonArray(row['Profissão']);
  const especialidade = parseJsonArray(row['Especialidade']);
  const registro = row['Texto 2'] || '';
  const bio = (row['Texto 3'] || '').trim();
  const agendamento = row['Agendamento de consulta'] || '';
  const curriculo = row['Currículo'] || '';
  const estado = row['Estado'] || '';
  const cidade = row['Cidade'] || '';
  const photoWix = row['Imagem 2'] || '';
  const volunteerWix = row['Imagem 1'] || '';
  const doctor8Wix = row['Imagem 3'] || '';

  return {
    id: row.ID || slugify(name),
    name,
    slug: slugify(name),
    profissao,
    especialidade,
    registro,
    bio,
    agendamento: agendamento.startsWith('http') ? agendamento : '',
    curriculo:
      curriculo.startsWith('http')
        ? curriculo
        : wixDocumentToUrl(curriculo),
    location: [cidade, estado].filter(Boolean).join(', '),
    photo: wixImageToUrl(photoWix),
    volunteerBadge: !!volunteerWix,
    doctor8: !!doctor8Wix,
    initials: initials(name),
  };
});

console.log(JSON.stringify({ count: professionals.length, sample: professionals[0] }, null, 2));

const outDir = path.join('public', 'data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'profissionais-consulta.json'),
  JSON.stringify(professionals, null, 2),
  'utf8'
);
console.log('Wrote', path.join(outDir, 'profissionais-consulta.json'));
