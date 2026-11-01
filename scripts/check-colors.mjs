// Dependency-free replacement for the former ESLint "no hard-coded colours" rule.
// Fails if a hex colour literal appears in app code outside the theme / default-data files.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const allowed = [/src[\\/]theme[\\/]/, /src[\\/]domain[\\/]defaults\.ts$/, /src[\\/]domain[\\/]colors\.ts$/];
const HEX = /(['"`])#[0-9a-fA-F]{3,8}\1/g;
const bad = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name) && !allowed.some((r) => r.test(p))) {
      fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => { if (HEX.test(line)) bad.push(`${path.relative(root, p)}:${i + 1}: ${line.trim()}`); HEX.lastIndex = 0; });
    }
  }
};
for (const d of ['src', 'app']) walk(path.join(root, d));
if (bad.length) { console.error('Hard-coded colours found (use theme tokens):\n' + bad.join('\n')); process.exit(1); }
console.log('check-colors: OK (no hard-coded colours outside the theme files)');
