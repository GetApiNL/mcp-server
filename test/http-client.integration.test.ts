/**
 * HTTP client integratietests tegen een lokale mock-server.
 *
 * Dekt de regressie waarbij een request-body per ongeluk als query-parameter
 * werd verstuurd en path-parameters dubbel werden meegestuurd.
 */

import { describe, test, expect, afterEach, beforeAll, afterAll, jest } from '@jest/globals';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpClient } from '../src/http-client.js';

// Onderdruk de request-logs (gaan naar stderr) voor schone testoutput.
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  jest.restoreAllMocks();
});

type CapturedRequest = {
  method?: string;
  path?: string;
  query: Record<string, string>;
  headers: http.IncomingHttpHeaders;
  body: any;
};

async function startServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
  const calls: CapturedRequest[] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const url = new URL(req.url || '/', 'http://localhost');
      calls.push({
        method: req.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        headers: req.headers,
        body: raw ? JSON.parse(raw) : undefined
      });
      handler(req, res);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

const ok = (_req: http.IncomingMessage, res: http.ServerResponse) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
};

let active: { close: () => Promise<void> } | null = null;

afterEach(async () => {
  await active?.close();
  active = null;
});

describe('HttpClient.request (integratie)', () => {
  test('stuurt body als request-body en query als query-string', async () => {
    const server = await startServer(ok);
    active = server;

    const client = new HttpClient('ga_test_12345678', { baseUrl: server.url });
    const result = await client.request(
      '/v1/items/{id}',
      { id: 'a b', q: 'hello world', body: { a: 1, tags: ['x', 'y'] } },
      { method: 'POST' },
      { id: 'path', q: 'query', body: 'body' }
    );

    expect(result.status).toBe(200);
    expect(server.calls).toHaveLength(1);

    const call = server.calls[0];
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/v1/items/a%20b'); // path-param ge-encodeerd
    expect(call.query).toEqual({ q: 'hello world' }); // body NIET als query
    expect(call.body).toEqual({ a: 1, tags: ['x', 'y'] }); // body als JSON-body
    expect(call.headers['x-api-key']).toBe('ga_test_12345678');
    expect(call.headers['content-type']).toContain('application/json');
  });

  test('geeft HTTP-foutstatussen ongewijzigd door', async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Invalid API key.' } }));
    });
    active = server;

    const client = new HttpClient('ga_test_bad', { baseUrl: server.url });
    const result = await client.request('/v1/lookup/ip', { ip: '8.8.8.8' }, { method: 'GET' }, { ip: 'query' });

    expect(result.status).toBe(401);
    expect(result.data.error.message).toBe('Invalid API key.');
  });

  test('weigert responses groter dan de limiet', async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ blob: 'x'.repeat(2048) }));
    });
    active = server;

    const client = new HttpClient('ga_test_12345678', { baseUrl: server.url, maxResponseSize: 64 });
    const result = await client.request('/v1/big', {}, { method: 'GET' });

    expect(result.status).toBe(500);
    expect(String(result.data.error.message)).toMatch(/te groot|maxContentLength|exceeded/i);
  });
});
