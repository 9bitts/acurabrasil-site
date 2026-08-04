#!/usr/bin/env node
/**
 * Bump ?v= on key CSS/JS so Safari/Cloudflare miss previously immutable caches.
 * Run after changing Cache-Control away from immutable.
 */
const fs = require('fs');
const path = require('path');

const V = process.argv[2] || '41';
const root = path.join(__dirname, '..', 'public');
const files = [];

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (name.endsWith('.html')) files.push(p);
  }
}
walk(root);

const KEYS = [
  'style.css',
  'campanhas.css',
  'i18n-loader.js',
  'i18n.js',
  'main.js',
  'cookie-consent.js',
  'seo.js',
  'analytics.js',
  'analytics-config.js',
  'doacao.js',
  'sos-venezuela-public.js',
  'newsletter.js',
];

let changed = 0;
for (const file of files) {
  let s = fs.readFileSync(file, 'utf8');
  const orig = s;

  // Unversioned critical scripts → add ?v=
  s = s.replace(
    /(src=["'])([^"']*\/)?(cookie-consent|seo|analytics|analytics-config|main|doacao)\.js(["'])/g,
    (_, a, dir, name, q) => `${a}${dir || ''}${name}.js?v=${V}${q}`
  );

  // Existing ?v=N → bump
  for (const key of KEYS) {
    const escaped = key.replace(/\./g, '\\.');
    const re = new RegExp(`((?:href|src)=["'][^"']*/)${escaped}\\?v=\\d+`, 'g');
    s = s.replace(re, `$1${key}?v=${V}`);
  }

  if (s !== orig) {
    fs.writeFileSync(file, s);
    changed += 1;
    console.log('updated', path.relative(root, file));
  }
}

console.log(`done: ${changed} files → v=${V}`);
