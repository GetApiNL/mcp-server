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

// Validateer API key
const apikey = validateApiKey();

// Vaste instellingen
const FIXED_CONFIG = fixedConfig;

async function main() {
  if (!apikey) {
    console.error('API_KEY is niet ingesteld. Stel de omgevingsvariabele API_KEY in en restart de server.');
    process.exit(1);
  }
  
  const specLoader = new SpecLoader(apikey);
  const toolBuilder = new ToolBuilder(specLoader, apikey);
  const http = new HttpClient(apikey);
  
  const tools = await toolBuilder.buildTools();
  
  const server = new McpServer(
    {
      name: 'getapi-mcp',
      version: '0.1.0',
    },
    {
      tools
    } as ServerOptions
  );
  
  const refreshInterval = FIXED_CONFIG.refreshIntervalMs || 300000;
  setInterval(async () => {
    await specLoader.refresh();
  }, refreshInterval);
  
  server.registerTool(
    toolBuilder.buildToolName('test'),
    {
      title: 'test',
      description: 'Test tool for GetApi MCP'
    },
    async (args: any) => {
      const result = await toolBuilder.executeCall('/api/test', args, { parameters: [], responses: {} } as any, z.object({}));
      
      return {
        content: [
          { type: 'text', text: result.data || '' }
        ],
        isError: !result.success
      };
    }
  );
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export { main };

main().catch((err: Error) => {
  console.error('Fout:', err.message);
  process.exit(1);
});