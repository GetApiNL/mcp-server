/**
 * Auth helpers
 */

// Vaste configuratie
export const fixedConfig = {
  specUrl: 'https://getapi.nl/docs/api.json',
  baseUrl: 'https://api.getapi.nl',
  authHeader: 'X-Api-Key',
  refreshIntervalMs: 60 * 60 * 1000, // 1 uur
  timeoutMs: 10 * 1000, // 10 seconden
  maxResponseSize: 1 * 1024 * 1024, // 1 MB
  maxSpecSize: 5 * 1024 * 1024, // 5 MB
  x402ExcludedOperations: new Set()
};

/**
 * API key validation
 * 
 * Returns: 'ga_live_xxxx' or 'ga_test_xxxx' if valid, null otherwise
 */
export function validateApiKey() {
  const apiKeyEnv = process.env.API_KEY;
  
  if (!apiKeyEnv) {
    return null;
  }
  
  if (!apiKeyEnv.startsWith('ga_live_') && !apiKeyEnv.startsWith('ga_test_')) {
    return null;
  }
  
  if (apiKeyEnv.length < 8) {
    return null;
  }
  
  return apiKeyEnv;
}

/**
 * Check if API key is set
 */
export function apiKeySet() {
  return process.env.API_KEY !== undefined;
}