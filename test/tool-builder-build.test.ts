/**
 * ToolBuilder: buildTools + executeCall + parseResponse
 */

import { describe, test, expect, jest } from '@jest/globals';
import { z } from 'zod';
import { ToolBuilder } from '../src/tool-builder.js';

const spec = {
  paths: {
    '/v1/bag/address': {
      get: {
        operationId: 'kadaster.bag.address',
        summary: 'Address lookup',
        parameters: [
          { in: 'query', name: 'postcode', required: true, schema: { type: 'string' } }
        ]
      }
    },
    '/v1/validate/vat': {
      post: {
        operationId: 'validation.vat',
        summary: 'Validate VAT',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { vat_number: { type: 'string' } }, required: ['vat_number'] } } }
        }
      }
    },
    '/v1/paid/thing': {
      get: { operationId: 'paid.thing', tags: ['x402'], summary: 'Paid' }
    }
  }
};

const buildBuilder = () => {
  const specLoader = { load: async () => {}, getCache: () => ({ spec, hash: 'h', valid: true }) };
  return new ToolBuilder(specLoader, 'ga_test_12345678');
};

describe('ToolBuilder.buildTools', () => {
  test('bouwt een tool per operatie en sluit x402 uit', async () => {
    const tools = await buildBuilder().buildTools();
    const names = tools.map((t) => t.name).sort();

    expect(names).toEqual(['getapi_kadaster_bag_address', 'getapi_validation_vat']);
    expect(names).not.toContain('getapi_paid_thing');

    const address = tools.find((t) => t.name === 'getapi_kadaster_bag_address')!;
    expect(address.description).toContain('GET /v1/bag/address');
    expect(address.inputSchema.postcode).toBeDefined();
  });

  test('gooit een fout als er geen spec is', async () => {
    const specLoader = { load: async () => {}, getCache: () => null };
    await expect(new ToolBuilder(specLoader, 'ga_test_12345678').buildTools()).rejects.toThrow(/No spec/);
  });
});

describe('ToolBuilder.executeCall', () => {
  test('geeft MCP-fout bij ongeldige parameters (zonder HTTP-call)', async () => {
    const builder = buildBuilder();
    builder.http = { request: jest.fn() } as any;

    const { shape, locations } = builder.buildParamsSchema([
      { in: 'query', name: 'ip', required: true, schema: { type: 'string' } }
    ]);

    const result = await builder.executeCall('/v1/lookup/ip', 'GET', {}, { method: 'GET' }, shape, locations);

    expect(result.isError).toBe(true);
    expect(builder.http.request).not.toHaveBeenCalled();
  });

  test('formatteert een succesvolle response als MCP-content', async () => {
    const builder = buildBuilder();
    builder.http = { request: async () => ({ status: 200, data: { ok: true }, headers: {} }) } as any;

    const { shape, locations } = builder.buildParamsSchema([
      { in: 'query', name: 'ip', required: true, schema: { type: 'string' } }
    ]);
    const result = await builder.executeCall('/v1/lookup/ip', 'GET', { ip: '8.8.8.8' }, { method: 'GET' }, shape, locations);

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toEqual({ ok: true });
  });

  test('formatteert een foutresponse als MCP-fout', async () => {
    const builder = buildBuilder();
    builder.http = { request: async () => ({ status: 401, data: { error: { message: 'Invalid API key.' } }, headers: {} }) } as any;

    const { shape, locations } = builder.buildParamsSchema([], undefined);
    const result = await builder.executeCall('/v1/lookup/ip', 'GET', {}, { method: 'GET' }, shape, locations);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('401');
    expect(result.content[0].text).toContain('Invalid API key.');
  });
});

describe('ToolBuilder.parseResponse', () => {
  test('accepteert 2xx', () => {
    const builder = buildBuilder();
    expect(builder.parseResponse({ status: 204, data: null }).isError).toBe(false);
  });

  test('behandelt onbekende foutvorm', () => {
    const builder = buildBuilder();
    const result = builder.parseResponse({ status: 500, data: 'boom' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('boom');
  });
});

describe('ToolBuilder buildToolName/op edgecases', () => {
  test('isX402 negeert niet-x402 tags', () => {
    expect(buildBuilder().isX402({ tags: ['public', { name: 'bag' }] })).toBe(false);
  });

  test('mapOpenAPIToZod valt terug op z.any voor onbekende types', () => {
    const t = buildBuilder().mapOpenAPIToZod({ type: 'weird' });
    expect(z.any().safeParse('x').success && t.safeParse('x').success).toBe(true);
  });
});
