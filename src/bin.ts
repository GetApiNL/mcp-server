#!/usr/bin/env node

/**
 * GetApi MCP Server start
 * 
 * Gebruik: npx getapi-mcp
 * 
 * De API-key wordt via de omgevingsvariabele API_KEY ingesteld.
 */

import { main } from './index.js';

main().catch((err: Error) => {
  // Let op: nooit de API-key loggen.
  console.error('Fout:', err?.message || String(err));
  process.exit(1);
});
