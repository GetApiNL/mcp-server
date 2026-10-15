#!/usr/bin/env node

/**
 * GetApi MCP Server start
 */

import { main } from './index.js';

async function startServer() {
  console.info('Starting GetApi MCP Server...');
  
  await main();
}

startServer().catch(err => {
  console.error('Fout:', err.message);
  process.exit(1);
});