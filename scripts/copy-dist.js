/**
 * Kopieer dist folder naar bin locatie na build
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pad naar dist folder
const distDir = path.join(__dirname, '..', 'dist');

// Pad naar bin folder
const binDir = path.join(__dirname, '..', 'bin');

// Maak bin folder als hij niet bestaat
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

// Zoek alle .js en .map bestanden in dist
const distFiles = [];
fs.readdirSync(distDir).forEach(file => {
  const distPath = path.join(distDir, file);
  if (fs.statSync(distPath).isFile() && (file.endsWith('.js') || file.endsWith('.js.map'))) {
    distFiles.push({
      name: file,
      sourcePath: distPath
    });
  }
});

// Kopieer bestanden naar bin
distFiles.forEach(({ name, sourcePath }) => {
  const binPath = path.join(binDir, name);
  fs.copyFileSync(sourcePath, binPath);
});

// Kopieer README.md naar bin (optioneel)
const readmePath = path.join(distDir, 'README.md');
if (fs.existsSync(readmePath)) {
  fs.copyFileSync(readmePath, path.join(binDir, 'README.md'));
}

console.log(`Build completed successfully!`);
console.log(`Bin directory: ${binDir}`);
console.log(`Copied ${distFiles.length} files.`);