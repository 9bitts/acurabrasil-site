import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const outDir = path.join(process.cwd(), 'public/js/vendor');
fs.mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(process.cwd(), 'node_modules/qrcode/lib/browser.js')],
  bundle: true,
  format: 'iife',
  globalName: 'QRCode',
  outfile: path.join(outDir, 'qrcode.min.js'),
  platform: 'browser',
  minify: true,
  sourcemap: false,
});

console.log('Bundled public/js/vendor/qrcode.min.js');
