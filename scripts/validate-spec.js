/**
 * Validatie en tool-lijst generatie
 * 
 * Gebruik dit script om de huidige GetApi spec te valideren
 * en de beschikbare tool-lijst te genereren.
 * 
 * npm run generate:tools
 */

import axios from 'axios';
import { z } from 'zod';

// Vaste instellingen
const FIXED_CONFIG = {
  baseUrl: 'https://api.getapi.nl',
  specUrl: 'https://api.getapi.nl/docs/api.json',
  authHeader: 'X-Api-Key'
};

// API Key placeholder (vervang met je echte key)
const API_KEY = process.env.API_KEY || 'ga_test_your_actual_key_here';

// OpenAPI schema validatie
const OpenAPISchema = z.object({
  openapi: z.string().min(1),
  info: z.object({
    title: z.string().min(1),
    version: z.string().min(1)
  }),
  paths: z.record(z.any()),
  components: z.record(z.any()).optional(),
  servers: z.array(z.object({
    url: z.string().url()
  })).optional()
});

async function fetchSpec() {
  const response = await axios.get(FIXED_CONFIG.specUrl, {
    headers: { [FIXED_CONFIG.authHeader]: API_KEY },
    validateStatus: () => true,
    timeout: 10000
  });
  
  return response.data;
}

function computeHash(spec: any): string {
  const sorted = sortSpec(spec);
  return hashCode(JSON.stringify(sorted));
}

function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash | 0;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

function sortSpec(spec: any): any {
  const sorted = JSON.parse(JSON.stringify(spec));
  
  Object.keys(sorted.info || {}).sort().forEach(key => {
    const val = sorted.info?.[key];
    if (typeof val === 'string') sorted.info[key] = val;
    else if (Array.isArray(val)) sorted.info[key] = [...val].sort();
    else if (typeof val === 'object' && val !== null) sorted.info[key] = sortObject(val);
  });
  
  const paths = Object.keys(sorted.paths || {}).sort();
  const sortedPaths = {};
  paths.forEach(path => {
    sortedPaths[path] = sorted.paths[path];
  });
  
  Object.keys(sortedPaths).forEach(path => {
    if (Array.isArray(sortedPaths[path])) {
      sortedPaths[path] = sortedPaths[path].sort((a, b) => (a.httpMethod || '').localeCompare(b.httpMethod || ''));
    }
  });
  
  if (sorted.tags) {
    sorted.tags = sorted.tags.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }
  
  return sorted;
}

function sortObject(obj: any): any {
  const sorted = {};
  Object.keys(obj).sort().forEach(key => {
    const val = obj[key];
    if (typeof val === 'string') sorted[key] = val;
    else if (Array.isArray(val)) sorted[key] = [...val].sort();
    else if (typeof val === 'object' && val !== null) sorted[key] = sortObject(val);
  });
  return sorted;
}

async function validateAndGenerate() {
  const response = await fetchSpec();
  
  console.log('Fetching spec...');
  console.log(`Response size: ${Math.round(response.length / 1024)} KB`);
  
  let spec: any;
  try {
    spec = JSON.parse(response);
    console.log('Spec parsed successfully');
  } catch (e) {
    console.error('Failed to parse spec:', e.message);
    process.exit(1);
  }
  
  // Validate OpenAPI
  try {
    const validation = OpenAPISchema.safeParse(spec);
    if (!validation.success) {
      console.error('OpenAPI validation failed:');
      validation.error.errors.forEach((err: any) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    console.log('OpenAPI validation: PASSED');
  } catch (e) {
    console.error('OpenAPI validation error:', e.message);
    process.exit(1);
  }
  
  // Count operations
  const paths = spec.paths || {};
  const operations: string[] = [];
  
  Object.entries(paths).forEach(([path, pathItem]: [string, any]) => {
    if (typeof pathItem === 'string') return;
    
    Object.entries(pathItem).forEach(([method, op]: [string, any]) => {
      if (method === 'parameters') return;
      
      const operationId = op.operationId;
      const tags = op.tags || [];
      
      // Exclude x402
      if (op.x402 || tags.some(t => t.includes('x402'))) {
        console.log(`Excluded x402: ${operationId} (${path} ${method})`);
        return;
      }
      
      operations.push(operationId);
    });
  });
  
  // Generate tool names
  const tools: string[] = [];
  operations.forEach(opId => {
    const name = `getapi_${opId}`.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2');
    tools.push(name);
  });
  
  // Sort tools
  tools.sort();
  
  console.log('\n=== Available Tools ===');
  console.log(`Total: ${tools.length}`);
  
  // Group by category
  console.log('\nBy category:');
  const categories: Record<string, string[]> = {};
  tools.forEach(tool => {
    const parts = tool.split('_');
    if (parts.length >= 3) {
      const category = parts.slice(0, 2).join('_');
      categories[category] = (categories[category] || []).concat(parts.slice(2).join('_'));
    }
  });
  
  Object.entries(categories).forEach(([category, tools]) => {
    console.log(`  ${category}: ${tools.length} tools`);
    tools.forEach(t => console.log(`    - ${t}`));
  });
  
  // Hash for change detection
  console.log('\n=== Spec Hash ===');
  const hash = computeHash(spec);
  console.log(`Hash: ${hash}`);
  
  return { hash, tools, operations };
}

// Run
validateAndGenerate().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
