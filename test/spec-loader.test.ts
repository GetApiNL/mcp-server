/**
 * Spec loader tests
 */

import { describe, test, expect, afterEach, jest } from '@jest/globals';
import axios from 'axios';
import { SpecLoader } from '../src/spec-loader.js';
import { fixedConfig } from '../src/auth.js';

const mockSpec = {
  openapi: '3.1.0',
  info: { title: 'Test API', version: '1.0.0' },
  paths: {
    '/b': { get: { operationId: 'bOp', responses: {} } },
    '/a': { get: { operationId: 'aOp', responses: {} } }
  }
};

describe('SpecLoader.validateSpec', () => {
  test('accepts a valid OpenAPI spec', () => {
    expect(new SpecLoader('ga_test_12345678').validateSpec(mockSpec)).toBe(true);
  });

  test('rejects an invalid spec', () => {
    expect(new SpecLoader('ga_test_12345678').validateSpec({ foo: 'bar' })).toBe(false);
  });
});

describe('SpecLoader.computeHash', () => {
  test('is stable regardless of path ordering', () => {
    const loader = new SpecLoader('ga_test_12345678');
    const reordered = {
      ...mockSpec,
      paths: {
        '/a': mockSpec.paths['/a'],
        '/b': mockSpec.paths['/b']
      }
    };
    expect(loader.computeHash(mockSpec)).toBe(loader.computeHash(reordered));
  });
});

describe('SpecLoader.excludeX402', () => {
  afterEach(() => {
    fixedConfig.x402ExcludedOperations.clear();
  });

  test('removes configured operations', () => {
    fixedConfig.x402ExcludedOperations.add('bOp');
    const loader = new SpecLoader('ga_test_12345678');
    const cleaned = loader.excludeX402(mockSpec);

    expect(cleaned.paths['/b']).toEqual({});
    expect(cleaned.paths['/a'].get.operationId).toBe('aOp');
  });

  test('does not mutate the input spec', () => {
    fixedConfig.x402ExcludedOperations.add('bOp');
    const loader = new SpecLoader('ga_test_12345678');
    const input = JSON.parse(JSON.stringify(mockSpec));

    loader.excludeX402(input);

    expect(input.paths['/b'].get.operationId).toBe('bOp');
  });
});

describe('SpecLoader.fetchSpec / load', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('laadt en cachet een geldige JSON-spec', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({
      headers: { 'content-type': 'application/json' },
      data: JSON.stringify(mockSpec)
    } as any);

    const loader = new SpecLoader('ga_test_12345678');
    await loader.load();

    const cache = loader.getCache();
    expect(cache).not.toBeNull();
    expect(cache.valid).toBe(true);
    expect(cache.spec.openapi).toBe('3.1.0');
    expect(typeof cache.hash).toBe('string');

    // Tweede load met dezelfde spec mag de cache niet vervangen.
    const first = loader.getCache();
    await loader.load();
    expect(loader.getCache()).toBe(first);
  });

  test('geeft null bij een niet-JSON content-type', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({
      headers: { 'content-type': 'text/html' },
      data: '<html></html>'
    } as any);

    const loader = new SpecLoader('ga_test_12345678');
    await loader.load();
    expect(loader.getCache()).toBeNull();
  });

  test('geeft null bij onparseerbare JSON', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({
      headers: { 'content-type': 'application/json' },
      data: '{ not json'
    } as any);

    const loader = new SpecLoader('ga_test_12345678');
    await loader.load();
    expect(loader.getCache()).toBeNull();
  });

  test('vangt netwerkfouten af en geeft null terug', async () => {
    jest.spyOn(axios, 'get').mockRejectedValue({ code: 'ECONNREFUSED' });

    const loader = new SpecLoader('ga_test_12345678');
    await loader.load();
    expect(loader.getCache()).toBeNull();
  });
});
