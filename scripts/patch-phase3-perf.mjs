import fs from 'fs';
import path from 'path';

const publicDir = path.join(process.cwd(), 'public');
const ASSET_V = '17';
const LIGHTHOUSE_PAGES = new Set([
  'index.html',
  'doacao.html',
  'consulta-venezuela.html',
  'solicitud-sos-venezuela.html',
]);

const FAVICON = `    <link rel="icon" href="/favicon.ico" type="image/png">\n`;

const ASYNC_CSS = `    <link rel="preload" href="css/style.css?v=${ASSET_V}" as="style">
    <link rel="stylesheet" href="css/style.css?v=${ASSET_V}" media="print" onload="this.media='all'">
    <noscript><link rel="stylesheet" href="css/style.css?v=${ASSET_V}"></noscript>\n`;

const files = fs.readdirSync(publicDir).filter((f) => f.endsWith('.html'));

for (const file of files) {
  let html = fs.readFileSync(path.join(publicDir, file), 'utf8');
  let changed = false;

  if (html.includes('?v=16')) {
    html = html.replace(/\?v=16/g, `?v=${ASSET_V}`);
    changed = true;
  }

  if (!html.includes('favicon.ico')) {
    html = html.replace(/(<meta name="viewport"[^>]*>\n)/, `$1${FAVICON}`);
    changed = true;
  }

  if (LIGHTHOUSE_PAGES.has(file)) {
    if (!html.includes('media="print"')) {
      if (html.includes('<link rel="stylesheet" href="css/style.css')) {
        html = html.replace(
          /\s*<link rel="stylesheet" href="css\/style\.css\?v=\d+">\n?/,
          `\n${ASYNC_CSS}`
        );
      } else {
        html = html.replace(/(<title>[^<]+<\/title>\n)/, `$1${ASYNC_CSS}`);
      }
      changed = true;
    }
  } else if (html.includes('<link rel="stylesheet" href="css/style.css')) {
    html = html.replace(
      /<link rel="stylesheet" href="css\/style\.css\?v=\d+">/,
      `<link rel="stylesheet" href="css/style.css?v=${ASSET_V}">`
    );
    if (html.includes(`css/style.css?v=${ASSET_V}`)) changed = true;
  }

  html = html.replace(
    /<script src="js\/analytics-config\.js"><\/script>/g,
    '<script src="js/analytics-config.js" defer></script>'
  );
  html = html.replace(
    /<script src="js\/seo\.js"><\/script>/g,
    '<script src="js/seo.js" defer></script>'
  );

  if (changed) {
    fs.writeFileSync(path.join(publicDir, file), html);
    console.log('patched', file);
  }
}

console.log('Done — asset v=' + ASSET_V);
