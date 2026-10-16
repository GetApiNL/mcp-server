/**
 * Auth helpers
 * 
 * Vaste configuratie en API-key validatie.
 */

// Vaste configuratie
export const fixedConfig = {
  specUrl: 'https://api.getapi.nl/docs/api.json',
  baseUrl: 'https://api.getapi.nl',
  authHeader: 'X-Api-Key',
  refreshIntervalMs: 60 * 60 * 1000, // 1 uur
  timeoutMs: 10 * 1000, // 10 seconden
  maxResponseSize: 1 * 1024 * 1024, // 1 MB
  maxSpecSize: 5 * 1024 * 1024, // 5 MB
  x402ExcludedOperations: new Set<string>()
};

/**
 * API key validation
 *
 * Returns: 'ga_live_xxxx' or 'ga_test_xxxx' if valid, null otherwise
 */
export function validateApiKey(): string | null {
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
export function apiKeySet(): boolean {
  return process.env.API_KEY !== undefined;
}
