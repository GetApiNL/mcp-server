/**
 * GetApi MCP Server
 * 
 * Een MCP-server die de GetApi-API beschikbaar maakt voor AI-clients.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SpecLoader } from './spec-loader.js';
import { ToolBuilder } from './tool-builder.js';
import { HttpClient } from './http-client.js';
import { validateApiKey, fixedConfig } from './auth.js';

// Type voor tools
type ToolDef = {
  name: string;
  description: string;
  handler: (args: any) => Promise<any>;
  paramsSchema: any;
};

// Validateer API key
const apikey = validateApiKey();

// Vaste instellingen
const FIXED_CONFIG = fixedConfig;

async function main() {
  if (!apikey) {
    console.error('API_KEY is niet ingesteld. Stel de omgevingsvariabele API_KEY in en restart de server.');
    process.exit(1);
  }
  
  console.info('Starting GetApi MCP Server...');
  console.info('Server gaat opstarten...');
  
  const specLoader = new SpecLoader(apikey);
  const toolBuilder = new ToolBuilder(specLoader, apikey);
  const http = new HttpClient(apikey);
  
  // Eerste poging: probeer spec te laden
  await specLoader.load();
  
  // Bouw tools als spec beschikbaar is
  const spec = specLoader.getCache();
  
  let allTools: ToolDef[] = [];
  
  if (spec) {
    allTools = await toolBuilder.buildTools();
    console.info('Spec loaded successfully!');
    console.info('OpenAPI version:', spec.spec?.openapi || 'unknown');
    console.info('Number of endpoints:', Object.keys(spec.spec?.paths || {}).length);
  } else {
    console.warn('Geen spec gevonden op het moment. Server start met dummy tools.');
    console.info('De tool-lijst wordt opgehaald bij het volgende succesvolle verzoek.');
    // Dummy tools
    allTools = [
      {
        name: 'ping',
        description: 'Test de connectie met de GetApi server',
        handler: async () => ({
          content: [{ type: 'text', text: 'GetApi server is beschikbaar' }],
          isError: false
        }),
        paramsSchema: z.object({})
      }
    ];
  }
  
  // Start MCP server met huidige tools
  const server = new McpServer(
    {
      name: 'getapi-mcp',
      version: '0.1.0',
    },
    {
      tools: allTools
    } as ServerOptions
  );
  
  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.info('Server is ready!');
  
  // Export a function that can be called to get current tools
  const getTools = async () => {
    await specLoader.load();
    const newSpec = specLoader.getCache();
    if (newSpec && (!spec || newSpec.hash !== spec?.hash)) {
      const newAllTools = await toolBuilder.buildTools();
      const allToolsWithTest = [
        ...newAllTools,
        {
          name: 'test',
          description: 'Test tool for GetApi MCP',
          handler: async (args: any) => {
            const result = await toolBuilder.executeCall('/api/test', args, { parameters: [], responses: {} } as any, z.object({}));
            return {
              content: [
                { type: 'text', text: result.data || 'Test response' }
              ],
              isError: !result.success
            };
          },
          paramsSchema: z.object({})
        }
      ];
      return newAllTools;
    }
    return allTools;
  };
  
  // Log status
  if (spec) {
    console.info('Endpoints:', Object.keys(spec.spec?.paths || {}).length);
  } else {
    console.info('Herstart de server wanneer de API beschikbaar is.');
  }
  
  // Start refresh interval for automatic updates
  const refreshInterval = FIXED_CONFIG.refreshIntervalMs || 60000;
  setInterval(async () => {
    await specLoader.refresh();
  }, refreshInterval);
  
  console.info('Auto-refresh interval started (' + refreshInterval + 'ms)');
}

export { main };

main().catch((err: Error) => {
  console.error('Fout:', err.message);
  process.exit(1);
});