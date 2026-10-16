#!/usr/bin/env node

/**
 * Documentatie-consistentiecheck.
 *
 * Controleert README.md en CHANGELOG.md op:
 *  - lokale links naar bestaande bestanden
 *  - in-page ankers die naar bestaande koppen verwijzen
 *  - versienummers die overeenkomen met package.json
 *  - `npm run <script>` verwijzingen die echt bestaan
 *  - gedocumenteerde config-waarden die overeenkomen met src/auth.ts
 *
 * Gebruik: npm run check:docs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const docs = ['README.md', 'CHANGELOG.md'];

const read = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf8');
const pkg = JSON.parse(read('package.json'));
const authSrc = read('src/auth.ts');

function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

function headingsOf(markdown) {
  const slugs = new Set();
  for (const line of markdown.split('\n')) {
    const m = /^#{1,6}\s+(.*)$/.exec(line);
    if (m) slugs.add(slugify(m[1]));
  }
  return slugs;
}

function checkLinks(file, markdown) {
  const slugs = headingsOf(markdown);
  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = linkRe.exec(markdown)) !== null) {
    const target = match[1].trim();
    if (/^[a-z]+:\/\//i.test(target) || target.startsWith('mailto:')) continue; // extern

    if (target.startsWith('#')) {
      const slug = target.slice(1);
      if (!slugs.has(slug)) errors.push(`${file}: anker ${target} verwijst naar geen bestaande kop`);
      continue;
    }

    const filePart = target.split('#')[0];
    if (!filePart) continue;
    const abs = path.resolve(rootDir, path.dirname(file), filePart);
    if (!fs.existsSync(abs)) errors.push(`${file}: link naar ontbrekend bestand '${filePart}'`);
  }
}

// 1. Links + ankers
for (const file of docs) {
  checkLinks(file, read(file));
}

// 2. Versie-consistentie
const versionRe = new RegExp(`getapi-mcp@([0-9]+\\.[0-9]+\\.[0-9]+)`, 'g');
for (const file of docs) {
  const content = read(file);
  let m;
  while ((m = versionRe.exec(content)) !== null) {
    if (m[1] !== pkg.version) {
      errors.push(`${file}: verwijst naar getapi-mcp@${m[1]} maar package.json is ${pkg.version}`);
    }
  }
}

// 3. npm run <script> verwijzingen
const scriptRe = /npm run ([a-z0-9:_-]+)/gi;
for (const file of docs) {
  const content = read(file);
  let m;
  while ((m = scriptRe.exec(content)) !== null) {
    if (!pkg.scripts[m[1]]) {
      errors.push(`${file}: verwijst naar 'npm run ${m[1]}' maar dat script bestaat niet`);
    }
  }
}

// 4. Config-waarden tegen src/auth.ts
const specUrlMatch = /specUrl:\s*'([^']+)'/.exec(authSrc);
const refreshMatch = /refreshIntervalMs:\s*([0-9*\s]+?)(?:,|\s*\/\/)/.exec(authSrc);

if (specUrlMatch) {
  const documentedSpec = specUrlMatch[1];
  if (!read('README.md').includes(documentedSpec)) {
    errors.push(`README.md: specUrl ${documentedSpec} uit src/auth.ts wordt niet gedocumenteerd`);
  }
}

if (refreshMatch) {
  const refreshMs = refreshMatch[1].split('*').reduce((acc, part) => acc * Number(part.trim()), 1);
  if (!read('README.md').includes(String(refreshMs))) {
    errors.push(`README.md: refreshIntervalMs ${refreshMs} uit src/auth.ts wordt niet gedocumenteerd`);
  }
}

// Standaard: geen verwijzingen naar het oude spec-URL.
for (const file of docs) {
  if (read(file).includes('https://getapi.nl/docs/api.json')) {
    errors.push(`${file}: bevat verouderde spec-URL 'https://getapi.nl/docs/api.json' (moet api.getapi.nl zijn)`);
  }
}

if (errors.length) {
  console.error('❌ Documentatiecheck gefaald:\n - ' + errors.join('\n - '));
  process.exit(1);
}

console.log('✅ Documentatiecheck OK (links, ankers, versies, scripts, config-waarden).');
