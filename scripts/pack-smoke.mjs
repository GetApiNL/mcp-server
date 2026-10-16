#!/usr/bin/env node

/**
 * Package smoke test.
 *
 * Pakt het npm-pakket (npm pack), installeert het in een tijdelijke map en
 * start de GEÏNSTALLEERDE bin via stdio. Zo controleren we het artefact dat
 * daadwerkelijk gepubliceerd wordt: dat de bin bestaat, dat alle dist-bestanden
 * meekomen en dat de server JSON-RPC antwoordt met tools.
 *
 * Gebruik: npm run test:package
 */

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'getapi-mcp-pack-'));
let tarball = null;

const fail = (msg) => {
  console.error('\n❌ PACKAGE SMOKE TEST FAILED: ' + msg);
  process.exit(1);
};

try {
  console.log('• npm pack');
  const packOutput = execSync('npm pack --json', { cwd: rootDir, encoding: 'utf8' });
  const packInfo = JSON.parse(packOutput);
  tarball = path.join(rootDir, packInfo[0].filename);
  const files = packInfo[0].files.map((f) => f.path);

  // Verplichte bestanden in het artefact.
  for (const required of ['package.json', 'dist/bin.js', 'dist/index.js', 'dist/auth.js', 'dist/tool-builder.js']) {
    if (!files.includes(required)) fail(`'${required}' ontbreekt in het pakket (files: ${files.join(', ')})`);
  }

  console.log('• installeren in tijdelijke map');
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'smoke', private: true }));
  execSync(`npm install --no-audit --no-fund "${tarball}"`, { cwd: tmpDir, stdio: 'inherit' });

  const installedBin = path.join(tmpDir, 'node_modules', 'getapi-mcp', 'dist', 'bin.js');
  if (!fs.existsSync(installedBin)) fail('geïnstalleerde bin (dist/bin.js) niet gevonden');

  console.log('• stdio handshake + tools/list');
  const child = spawn(process.execPath, [installedBin], {
    env: { ...process.env, API_KEY: 'ga_test_1234567890' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let stdout = '';
  let buffer = '';
  const waiters = new Map();
  let nextId = 1;

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdout += text;
    buffer += text;
    let i;
    while ((i = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (typeof msg.id === 'number' && waiters.has(msg.id)) {
        waiters.get(msg.id)(msg);
        waiters.delete(msg.id);
      }
    }
  });

  const rpc = (method, params = {}, timeoutMs = 20000) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => { waiters.delete(id); reject(new Error(`timeout op ${method}`)); }, timeoutMs);
      waiters.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });

  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  child.kill();

  if (list.error) fail('tools/list gaf een fout: ' + JSON.stringify(list.error));
  const tools = list.result?.tools || [];
  if (tools.length < 1) fail('geen tools geregistreerd in het gepubliceerde pakket');

  // stdout moet volledig JSON-RPC zijn (geen log-vervuiling).
  const nonJson = stdout.split('\n').filter(Boolean).filter((l) => { try { JSON.parse(l); return false; } catch { return true; } });
  if (nonJson.length) fail('niet-JSON op stdout: ' + nonJson.join(' | '));

  console.log(`\n✅ PACKAGE SMOKE TEST OK — ${tools.length} tools, stdout is pure JSON-RPC.`);
} catch (err) {
  fail(err?.message || String(err));
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (tarball) fs.rmSync(tarball, { force: true });
}
