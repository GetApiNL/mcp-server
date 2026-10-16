/**
 * GetApi MCP Server
 * 
 * Een MCP-server die de GetApi-API beschikbaar maakt voor AI-clients.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SpecLoader } from './spec-loader.js';
import { ToolBuilder } from './tool-builder.js';
import type { ToolDefinition } from './tool-builder.js';
import { validateApiKey, fixedConfig } from './auth.js';

const nodeRequire = createRequire(import.meta.url);
const pkg = nodeRequire('../package.json') as { version?: string };
const SERVER_VERSION = pkg.version || '0.1.0';

// Alle logging gaat naar stderr: stdout is gereserveerd voor het MCP (JSON-RPC) protocol.
const log = (...args: unknown[]) => console.error(...args);

type RegisteredTool = { remove: () => void };

function fallbackTools(): ToolDefinition[] {
  return [
    {
      name: 'getapi_ping',
      description: 'Test de connectie met de GetApi MCP server',
      inputSchema: {},
      handler: async () => ({
        content: [{ type: 'text', text: 'GetApi MCP server is beschikbaar' }],
        isError: false
      })
    }
  ];
}

export async function main(): Promise<void> {
  const apiKey = validateApiKey();

  if (!apiKey) {
    throw new Error('API_KEY is niet ingesteld of ongeldig. Stel de omgevingsvariabele API_KEY in (formaat ga_live_... of ga_test_...).');
  }

  log('Starting GetApi MCP Server...');

  const specLoader = new SpecLoader(apiKey);
  const toolBuilder = new ToolBuilder(specLoader, apiKey);

  const server = new McpServer({
    name: 'getapi-mcp',
    version: SERVER_VERSION
  });

  const registered = new Map<string, RegisteredTool>();

  const registerDefinitions = (defs: ToolDefinition[]) => {
    for (const tool of registered.values()) {
      tool.remove();
    }
    registered.clear();

    for (const def of defs) {
      const registeredTool = server.registerTool(
        def.name,
        { description: def.description, inputSchema: def.inputSchema },
        async (args: any) => def.handler(args)
      );
      registered.set(def.name, registeredTool as RegisteredTool);
    }

    server.sendToolListChanged();
  };

  // Eerste poging: probeer spec te laden.
  await specLoader.load();

  const spec = specLoader.getCache();
  let defs: ToolDefinition[];

  if (spec) {
    defs = await toolBuilder.buildTools();
    log(`Spec geladen: OpenAPI ${spec.spec?.openapi || 'unknown'}, ${Object.keys(spec.spec?.paths || {}).length} endpoints.`);
  } else {
    log('Geen spec beschikbaar. Server start met een fallback-tool; de tool-lijst wordt bij de volgende refresh opgehaald.');
    defs = fallbackTools();
  }

  registerDefinitions(defs);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`GetApi MCP server is gereed (${registered.size} tools).`);

  // Automatische refresh van de spec + tools.
  const intervalMs = fixedConfig.refreshIntervalMs || 60 * 60 * 1000;
  const timer = setInterval(async () => {
    const before = specLoader.getCache()?.hash;
    try {
      await specLoader.refresh();
    } catch (err: any) {
      log('Refresh van spec mislukt:', err?.message || String(err));
      return;
    }

    const after = specLoader.getCache()?.hash;
    if (after && after !== before) {
      try {
        registerDefinitions(await toolBuilder.buildTools());
        log(`Tools vernieuwd (${registered.size} tools).`);
      } catch (err: any) {
        log('Herbouwen van tools mislukt:', err?.message || String(err));
      }
    }
  }, intervalMs);

  // Laat het proces niet open blijven staan door de timer alleen.
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

// Alleen automatisch starten wanneer dit bestand direct wordt uitgevoerd
// (voorkomt dubbel starten wanneer ./index.js door ./bin.js wordt geïmporteerd).
const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(path.resolve(entry)).href === import.meta.url;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((err: Error) => {
    log('Fout:', err?.message || String(err));
    process.exit(1);
  });
}

export { SERVER_VERSION };
