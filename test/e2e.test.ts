/**
 * End-to-end validatie van het gepubliceerde pakket.
 *
 * Start de echte MCP-server (dist/bin.js) als subprocess via stdio en
 * valideert het JSON-RPC protocol, de tool-registratie en de logging.
 * Dit dekt de bugs die eerder optraden: stdout-vervuiling, dubbele start
 * en het niet registreren van tools.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn, execSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';

const rootDir = path.resolve(__dirname, '..');
const binPath = path.join(rootDir, 'dist', 'bin.js');

interface RpcMessage { jsonrpc: string; id?: number; method?: string; result?: any; error?: any; }

class StdioMcpHarness {
  private child: ChildProcessWithoutNullStreams;
  stdout = '';
  stderr = '';
  private buffer = '';
  private waiters = new Map<number, (msg: RpcMessage) => void>();
  private nextId = 1;

  constructor() {
    this.child = spawn(process.execPath, [binPath], {
      cwd: rootDir,
      env: { ...process.env, API_KEY: 'ga_test_1234567890' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      this.stdout += text;
      this.buffer += text;
      let index: number;
      while ((index = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, index).trim();
        this.buffer = this.buffer.slice(index + 1);
        if (!line) continue;
        let msg: RpcMessage;
        try {
          msg = JSON.parse(line);
        } catch {
          continue; // niet-JSON op stdout wordt apart gecontroleerd via this.stdout
        }
        if (typeof msg.id === 'number' && this.waiters.has(msg.id)) {
          this.waiters.get(msg.id)!(msg);
          this.waiters.delete(msg.id);
        }
      }
    });

    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderr += chunk.toString();
    });
  }

  notify(method: string, params: any = {}): void {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  request(method: string, params: any = {}, timeoutMs = 30000): Promise<RpcMessage> {
    const id = this.nextId++;
    return new Promise<RpcMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id);
        reject(new Error(`Timeout op JSON-RPC '${method}'`));
      }, timeoutMs);
      this.waiters.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  stop(): void {
    try {
      this.child.kill();
    } catch {
      // negeren
    }
  }
}

const stdoutLinesAreJson = (stdout: string): boolean =>
  stdout.split('\n').filter(Boolean).every((line) => {
    try {
      JSON.parse(line);
      return true;
    } catch {
      return false;
    }
  });

let harness: StdioMcpHarness;

beforeAll(() => {
  if (!existsSync(binPath)) {
    execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
  }
  harness = new StdioMcpHarness();
});

afterAll(() => {
  harness?.stop();
});

describe('GetApi MCP end-to-end', () => {
  test('initialize levert server-info', async () => {
    const res = await harness.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'e2e', version: '1.0.0' }
    });
    harness.notify('notifications/initialized');

    expect(res.error).toBeUndefined();
    expect(res.result.serverInfo.name).toBe('getapi-mcp');
    expect(typeof res.result.serverInfo.version).toBe('string');
  });

  test('tools/list registreert minimaal één tool', async () => {
    const res = await harness.request('tools/list', {});
    expect(res.error).toBeUndefined();
    expect(Array.isArray(res.result.tools)).toBe(true);
    expect(res.result.tools.length).toBeGreaterThan(0);

    for (const tool of res.result.tools) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  test('toolnamen zijn uniek', async () => {
    const res = await harness.request('tools/list', {});
    const names = res.result.tools.map((t: any) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('elke tool inputSchema is geldige JSON Schema', async () => {
    const res = await harness.request('tools/list', {});
    const ajv = new Ajv();

    for (const tool of res.result.tools as any[]) {
      const valid = ajv.validateSchema(tool.inputSchema);
      if (!valid) {
        throw new Error(`${tool.name} inputSchema is ongeldige JSON Schema: ${ajv.errorsText()}`);
      }

      // Meta-schema check alleen is niet genoeg: `required` moet naar bestaande properties verwijzen.
      const schema = tool.inputSchema;
      if (Array.isArray(schema.required) && schema.properties) {
        const defined = Object.keys(schema.properties);
        for (const property of schema.required) {
          if (!defined.includes(property)) {
            throw new Error(`${tool.name}.required bevat onbekende property '${property}'`);
          }
        }
      }
    }
  });

  test('ontbrekende verplichte parameter geeft een nette fout', async () => {
    const res = await harness.request('tools/call', { name: 'getapi_lookup_ip', arguments: {} });
    const isError = res.result?.isError === true || res.error !== undefined;
    expect(isError).toBe(true);
  });

  test('API-key lekt niet naar stderr', () => {
    expect(harness.stderr).not.toContain('ga_test_1234567890');
  });

  test('stdout bevat uitsluitend JSON-RPC (geen log-vervuiling)', () => {
    // Alle logregels horen op stderr te staan, niet op stdout.
    expect(stdoutLinesAreJson(harness.stdout)).toBe(true);
    expect(harness.stderr).toContain('GetApi MCP server is gereed');
  });

  test('de server start precies één keer', () => {
    const starts = harness.stderr.split('Starting GetApi MCP Server...').length - 1;
    expect(starts).toBe(1);
  });
});
