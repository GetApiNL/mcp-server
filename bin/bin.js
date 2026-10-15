#!/usr/bin/env node
/**
 * GetApi MCP Server start
 *
 * Gebruik: npx getapi-mcp [--api-key KEY]
 *
 * Options:
 *   -k, --api-key  API key voor GetApi (optioneel, ook via API_KEY env var)
 */
import { main } from './index.js';
async function startServer() {
    console.info('Starting GetApi MCP Server...');
    // API_KEY kan via omgevingsvariabele API_KEY worden ingesteld
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        console.error('API_KEY is niet ingesteld. Stel de omgevingsvariabele API_KEY in en restart de server.');
        process.exit(1);
    }
    console.info(`Using API_KEY: ${apiKey.substring(0, 15)}...`);
    await main();
}
startServer().catch(err => {
    console.error('Fout:', err.message);
    process.exit(1);
});
