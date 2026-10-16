/**
 * Tool builder tests
 */

import { describe, test, expect } from '@jest/globals';
import { z } from 'zod';
import { ToolBuilder } from '../src/tool-builder.js';

const builder = () => new ToolBuilder({ specLoader: null as any, apiKey: 'ga_test_12345678' }, 'ga_test_12345678');

describe('ToolBuilder.buildToolName', () => {
  test('converts dots to underscores', () => {
    expect(builder().buildToolName('test.tool')).toBe('getapi_test_tool');
  });

  test('handles camelCase operations', () => {
    expect(builder().buildToolName('operationId')).toBe('getapi_operation_id');
  });

  test('handles nested operations', () => {
    expect(builder().buildToolName('category.subcategory.operation'))
      .toBe('getapi_category_subcategory_operation');
  });
});

describe('ToolBuilder.isX402', () => {
  test('detects x402 flag', () => {
    expect(builder().isX402({ x402: true })).toBe(true);
  });

  test('detects x402 tag', () => {
    expect(builder().isX402({ tags: ['x402-paid'] })).toBe(true);
    expect(builder().isX402({ tags: [{ name: 'x402' }] })).toBe(true);
  });

  test('ignores regular operations', () => {
    expect(builder().isX402({ tags: ['public'] })).toBe(false);
  });
});

describe('ToolBuilder.buildParamsSchema', () => {
  test('returns a raw Zod shape that validates required/optional params', () => {
    const { shape, locations } = builder().buildParamsSchema([
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
      { in: 'query', name: 'limit', required: false, schema: { type: 'integer' } },
      { in: 'header', name: 'X-Api-Key', required: true, schema: { type: 'string' } }
    ]);

    // Auth header mag niet als tool-parameter verschijnen.
    expect(Object.keys(shape).sort()).toEqual(['id', 'limit']);
    expect(locations.id).toBe('path');
    expect(locations.limit).toBe('query');

    const schema = z.object(shape);
    expect(schema.safeParse({ id: 'abc' }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false); // id is verplicht
  });

  test('maps request body to a "body" property', () => {
    const { shape, locations } = builder().buildParamsSchema([], {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { email: { type: 'string' } },
            required: ['email']
          }
        }
      }
    });

    expect(locations.body).toBe('body');
    const schema = z.object(shape);
    expect(schema.safeParse({ body: { email: 'a@b.nl' } }).success).toBe(true);
    expect(schema.safeParse({ body: { email: 5 } }).success).toBe(false);
  });

  test('produces schemas that do not throw at parse time', () => {
    const { shape } = builder().buildParamsSchema([
      { in: 'query', name: 'postcode', required: true, schema: { type: 'string' } }
    ]);

    // Dit was de eerdere bug: plain objecten i.p.v. Zod-schemas -> _parse is not a function.
    expect(() => z.object(shape).safeParse({ postcode: '1234AB' })).not.toThrow();
  });
});

describe('ToolBuilder.mapOpenAPIToZod', () => {
  test('maps enums to a union/literal', () => {
    const schema = z.object({ type: builder().mapOpenAPIToZod({ type: 'string', enum: ['A', 'MX'] }) });
    expect(schema.safeParse({ type: 'A' }).success).toBe(true);
    expect(schema.safeParse({ type: 'Z' }).success).toBe(false);
  });

  test('maps arrays', () => {
    const schema = builder().mapOpenAPIToZod({ type: 'array', items: { type: 'string' } });
    expect(schema.safeParse(['a', 'b']).success).toBe(true);
    expect(schema.safeParse([1]).success).toBe(false);
  });
});
