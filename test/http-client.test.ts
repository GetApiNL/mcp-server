/**
 * HTTP client tests
 */

import { describe, test, expect } from '@jest/globals';
import { HttpClient } from '../src/http-client.js';

const client = () => new HttpClient('ga_test_12345678');

describe('HttpClient.buildUrl', () => {
  test('substitutes path parameters', () => {
    expect(client().buildUrl('/v1/bag/{id}', { id: 'abc123' })).toBe('/v1/bag/abc123');
  });

  test('URL-encodes path parameter values exactly once', () => {
    expect(client().buildUrl('/v1/x/{q}', { q: 'a b/c' })).toBe('/v1/x/a%20b%2Fc');
  });

  test('leaves placeholder when a path parameter is missing', () => {
    expect(client().buildUrl('/v1/x/{q}', {})).toBe('/v1/x/_q_');
  });
});

describe('HttpClient.redactParams', () => {
  test('redacts API key header', () => {
    expect(client().redactParams({ 'X-Api-Key': 'ga_live_secret' })).toEqual({ 'X-Api-Key': '[REDACTED]' });
  });

  test('redacts API keys in arbitrary values and arrays', () => {
    const out = client().redactParams({ key: 'ga_live_abc', list: ['ga_test_xyz', 'plain'] });
    expect(out).toEqual({ key: '[API_KEY]', list: ['[API_KEY]', 'plain'] });
  });
});

describe('HttpClient.handleRequestError', () => {
  test('maps timeout to 504', () => {
    expect(client().handleRequestError({ code: 'ECONNABORTED' }).status).toBe(504);
  });

  test('maps connection refused to 503', () => {
    expect(client().handleRequestError({ code: 'ECONNREFUSED' }).status).toBe(503);
  });

  test('passes through HTTP error responses', () => {
    const result = client().handleRequestError({ response: { status: 404, data: { message: 'nope' }, headers: {} } });
    expect(result.status).toBe(404);
    expect(result.data.message).toBe('nope');
  });
});
