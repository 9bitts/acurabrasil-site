import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'public');
const htmlFiles = fs.readdirSync(root).filter((f) => f.endsWith('.html'));
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');

const issues = [];

// Inline styles that break mobile grids
for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  if (html.includes('grid-column: span 2')) {
    issues.push(`${file}: inline grid-column: span 2 may break single-column mobile grid`);
  }
  if (html.includes('min-width:') || html.includes('width:') && html.match(/style="[^"]*width:\s*\d+px/)) {
    const m = html.match(/style="[^"]*width:\s*\d+px[^"]*"/g);
    if (m) m.forEach((s) => issues.push(`${file}: fixed inline width ${s.slice(0, 60)}`));
  }
}

// CSS gaps
if (!css.includes('overflow-x')) {
  issues.push('CSS: no overflow-x rule on html/body — horizontal scroll risk');
}
if (!css.match(/@media[^}]+\.page-hero/)) {
  issues.push('CSS: page-hero may lack mobile padding adjustment');
}
if (!css.includes('.docs-list')) {
  issues.push('CSS: docs-list missing');
} else if (!css.match(/@media[^}]*docs-list/s)) {
  issues.push('CSS: docs-list has no mobile breakpoint rules');
}
if (!css.match(/@media[^}]*journey-step/s)) {
  issues.push('CSS: journey-step has no mobile breakpoint rules');
}
if (!css.match(/@media[^}]*consulta-hero/s)) {
  issues.push('CSS: consulta-hero has no dedicated mobile rules');
}
if (!css.match(/@media[^}]*cta-voluntario/s)) {
  issues.push('CSS: cta-voluntario has no mobile rules');
}
if (!css.match(/@media[^}]*nav-link-destaque/s)) {
  issues.push('CSS: nav-link-destaque visible in mobile nav — may need wrap');
}

const mediaBlocks = css.match(/@media \(max-width: \d+px\)/g) || [];
issues.push(`Breakpoints found: ${mediaBlocks.join(', ')}`);

fs.writeFileSync(
  path.join(process.cwd(), 'mobile-audit-static.txt'),
  issues.join('\n'),
  'utf8'
);
console.log(issues.join('\n'));
