#!/usr/bin/env node

/**
 * Live contract test.
 *
 * Roept een paar echte GetApi-endpoints aan via de gebouwde MCP-server (stdio)
 * en controleert of de responses nog steeds aan het verwachte contract voldoen.
 * Doel: detecteren dat de upstream API is veranderd (anders dan de unit-tests,
 * die met een gemockte spec werken).
 *
 * Vereist een API_KEY (ga_live_ of ga_test_). Zonder key wordt de test
 * overgeslagen met exitcode 0, zodat CI niet faalt als er geen secret is.
 *
 * Gebruik: API_KEY=ga_test_... npm run test:live
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binPath = path.join(rootDir, 'dist', 'bin.js');

const apiKey = process.env.API_KEY || process.env.GETAPI_API_KEY || '';

if (!apiKey) {
  console.log('⏭️  Live contract test overgeslagen: geen API_KEY gezet.');
  process.exit(0);
}

if (!/^ga_(live|test)_/.test(apiKey)) {
  console.error('❌ API_KEY heeft geen verwacht formaat (ga_live_/ga_test_).');
  process.exit(1);
}

if (!fs.existsSync(binPath)) {
  console.error(`❌ ${path.relative(rootDir, binPath)} niet gevonden. Draai eerst "npm run build".`);
  process.exit(1);
}

const child = spawn(process.execPath, [binPath], {
  env: { ...process.env, API_KEY: apiKey },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stderr = '';
child.stderr.on('data', (d) => {
  stderr += d.toString();
});

let buffer = '';
const pending = new Map();
let nextId = 1;

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      failures.push(`niet-JSON op stdout (protocolvervuiling): ${line.slice(0, 200)}`);
      continue;
    }
    const resolve = pending.get(message.id);
    if (resolve) {
      pending.delete(message.id);
      resolve(message);
    }
  }
});

function request(method, params, timeoutMs = 20000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout na ${timeoutMs}ms voor ${method}`));
    }, timeoutMs);
    pending.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

async function callTool(name, args) {
  const response = await request('tools/call', { name, arguments: args });
  if (response.error) {
    throw new Error(`${name} → JSON-RPC fout: ${JSON.stringify(response.error)}`);
  }
  const result = response.result;
  const text = result?.content?.[0]?.text ?? '';

  if (result?.isError) {
    if (/401|403|unauthorized|api[\s_-]?key|ongeldig|invalid/i.test(text)) {
      throw new Error(`${name} → authenticatiefout (key ongeldig of verlopen): ${text.slice(0, 200)}`);
    }
    throw new Error(`${name} → onverwachte fout: ${text.slice(0, 200)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${name} → response is geen JSON: ${text.slice(0, 200)}`);
  }
}

async function run() {
  await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'live-contract', version: '1.0.0' },
  });
  notify('notifications/initialized');

  const ip = await callTool('getapi_lookup_ip', { ip: '8.8.8.8' });
  check(ip.found === true, 'getapi_lookup_ip: found !== true');
  check(ip.ip === '8.8.8.8', 'getapi_lookup_ip: ip komt niet overeen');
  check(typeof ip.country === 'string' && ip.country.length > 0, 'getapi_lookup_ip: country ontbreekt');
  check(/^[A-Z]{2}$/.test(ip.country_code || ''), 'getapi_lookup_ip: country_code ongeldig');

  const postcode = await callTool('getapi_lookup_postcode', { postcode: '1012AB', number: 1 });
  check(postcode.found === true, 'getapi_lookup_postcode: found !== true');
  check(typeof postcode.street === 'string' && postcode.street.length > 0, 'getapi_lookup_postcode: street ontbreekt');
  check(typeof postcode.city === 'string' && postcode.city.length > 0, 'getapi_lookup_postcode: city ontbreekt');

  const iban = await callTool('getapi_validation_iban', { body: { iban: 'NL91ABNA0417164300' } });
  check(iban.valid === true, 'getapi_validation_iban: valid !== true voor een geldige IBAN');

  const dns = await callTool('getapi_lookup_dns_records', { domain: 'getapi.nl', type: 'A' });
  check(dns.found === true, 'getapi_lookup_dns_records: found !== true');
  check(Array.isArray(dns.records) && dns.records.length > 0, 'getapi_lookup_dns_records: geen records');
}

run()
  .catch((error) => {
    failures.push(error.message);
  })
  .finally(() => {
    try {
      child.kill('SIGTERM');
    } catch {
      /* negeren */
    }

    if (failures.length) {
      console.error('❌ Live contract test gefaald:\n - ' + failures.join('\n - '));
      if (stderr.trim()) {
        console.error('--- server stderr (laatste 1000 tekens) ---\n' + stderr.trim().slice(-1000));
      }
      process.exit(1);
    }

    console.log('✅ Live contract test OK — echte API-responses voldoen aan het verwachte contract.');
  });
