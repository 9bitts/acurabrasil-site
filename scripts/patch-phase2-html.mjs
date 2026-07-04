import fs from 'fs';
import path from 'path';

const publicDir = path.join(process.cwd(), 'public');
const ASSET_V = '16';
const files = fs.readdirSync(publicDir).filter((f) => f.endsWith('.html'));

const FONT_PRELOAD = `    <link rel="preload" href="fonts/inter-latin-400-normal.woff2?v=${ASSET_V}" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="fonts/inter-latin-600-normal.woff2?v=${ASSET_V}" as="font" type="font/woff2" crossorigin>
`;

const SKIP_LINK = `    <a class="skip-link" href="#main-content" data-i18n="common.skipLink">Ir al contenido principal</a>
`;

const LANG_BOOT = `    <script src="js/i18n-loader.js?v=${ASSET_V}"></script>
    <script>try{var l=localStorage.getItem('acura.lang')||'es';document.documentElement.lang=l==='es'?'es-VE':'pt-BR';}catch(e){}</script>
`;

function wrapLogoImg(html) {
  return html.replace(
    /<img src="img\/logo-acurabrasil\.png" alt="([^"]*)" class="(logo-img|hero-logo)"(\s+width="(\d+)"\s+height="(\d+)")?>/g,
    (match, alt, cls, dim, w, h) => {
      const width = w || (cls === 'hero-logo' ? '420' : '180');
      const height = h || (cls === 'hero-logo' ? '110' : '48');
      const priority = cls === 'hero-logo' ? ' fetchpriority="high"' : '';
      return `<picture><source srcset="img/logo-acurabrasil.webp?v=${ASSET_V}" type="image/webp"><img src="img/logo-acurabrasil.png?v=${ASSET_V}" alt="${alt}" class="${cls}" width="${width}" height="${height}"${priority}></picture>`;
    }
  );
}

for (const file of files) {
  let html = fs.readFileSync(path.join(publicDir, file), 'utf8');
  let changed = false;

  const before = html;
  html = html.replace(
    /\s*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\s*<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]+" rel="stylesheet">\s*/g,
    ''
  );

  if (!html.includes('fonts/inter-latin-400')) {
    html = html.replace(/(<meta name="viewport"[^>]*>\n)/, `$1${FONT_PRELOAD}`);
  }

  html = html.replace(/\?v=\d+/g, `?v=${ASSET_V}`);
  html = html.replace(/js\/i18n-data\.js(\?v=\d+)?/g, `js/i18n-loader.js?v=${ASSET_V}`);

  if (!html.includes('i18n-loader.js') && html.includes('</head>')) {
    html = html.replace('</head>', `${LANG_BOOT}</head>`);
  } else if (html.includes('i18n-loader.js') && !html.includes("localStorage.getItem('acura.lang')")) {
    html = html.replace(
      new RegExp(`<script src="js/i18n-loader\\.js\\?v=${ASSET_V}"></script>`),
      LANG_BOOT.trim()
    );
  }

  if (!html.includes('skip-link') && html.includes('<body')) {
    html = html.replace(/<body([^>]*)>/, `<body$1>\n${SKIP_LINK}`);
    if (!html.includes('id="main-content"')) {
      html = html.replace(/(<header class="header">)/, '<main id="main-content">\n    $1');
      html = html.replace(/(<footer class="footer">)/, '    </main>\n    $1');
    }
  }

  html = wrapLogoImg(html);

  if (file === 'doacao.html' && !html.includes('vendor/qrcode.min.js')) {
    html = html.replace(
      /<script src="js\/doacao\.js/,
      `<script src="js/vendor/qrcode.min.js?v=${ASSET_V}"></script>\n    <script src="js/doacao.js`
    );
  }

  if (html !== before) {
    fs.writeFileSync(path.join(publicDir, file), html, 'utf8');
    console.log('patched', file);
  }
}
