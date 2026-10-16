/**
 * HTTP Client
 * 
 * Voert HTTP verzoeken uit naar de GetApi server.
 */

import axios from 'axios';
import type { AxiosResponse } from 'axios';
import { fixedConfig } from './auth.js';

export type ParamLocation = 'path' | 'query' | 'header' | 'body';

export type HttpClientOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  maxResponseSize?: number;
};

export class HttpClient {
  client: any;
  baseUrl: string;
  timeoutMs: number;
  maxResponseSize: number;

  constructor(apiKey: string, options: HttpClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? fixedConfig.baseUrl;
    this.timeoutMs = options.timeoutMs ?? fixedConfig.timeoutMs;
    this.maxResponseSize = options.maxResponseSize ?? fixedConfig.maxResponseSize;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeoutMs,
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json'
      },
      maxBodyLength: this.maxResponseSize,
      maxContentLength: this.maxResponseSize,
      validateStatus: (status: number) => status >= 200 && status < 600
    });

    // Request interceptor voor host control
    this.client.interceptors.request.use((config: any) => {
      if (config.url) {
        const parsedUrl = new URL(config.url, this.baseUrl);

        if (parsedUrl.origin !== this.baseUrl) {
          throw new Error('Host niet toegestaan: ' + config.url);
        }
      }

      return config;
    });
  }

  async request(path: string, params: any = {}, op: any = {}, paramMap: Record<string, ParamLocation> = {}): Promise<any> {
    const startTime = Date.now();

    const method = (op.method || 'GET').toUpperCase();

    const pathParams: Record<string, any> = {};
    const queryParams: Record<string, any> = {};
    const headerParams: Record<string, any> = {};
    let body: any;

    Object.entries(params || {}).forEach(([key, value]: [string, any]) => {
      if (value === undefined || value === null || value === '') return;
      const location = paramMap[key] || 'query';

      if (location === 'path') pathParams[key] = value;
      else if (location === 'header') headerParams[key] = value;
      else if (location === 'body') body = value;
      else queryParams[key] = value;
    });

    const url = this.buildUrl(path, pathParams);

    const config = {
      method,
      url,
      params: queryParams,
      data: body,
      timeout: this.timeoutMs,
      headers: headerParams,
      validateStatus: (status: number) => status >= 200 && status < 600,
      maxBodyLength: this.maxResponseSize,
      maxContentLength: this.maxResponseSize
    };

    try {
      const response: AxiosResponse = await this.client(config);

      // Check response size
      if (response.data) {
        const size = JSON.stringify(response.data).length;
        if (size > this.maxResponseSize) {
          throw new Error('Response te groot: ' + Math.round(size / 1024) + ' KB');
        }
      }

      const duration = Date.now() - startTime;

      // Log resultaat (zonder API-key)
      this.logRequest(path, method, params, response.status, duration);

      return {
        status: response.status,
        data: response.data,
        headers: response.headers || {}
      };
    } catch (error: any) {
      return this.handleRequestError(error);
    }
  }

  buildUrl(path: string, pathParams: Record<string, any> = {}): string {
    return path.replace(/\{([^}]+)\}/g, (_, name: string) => {
      const value = pathParams[name];
      if (value !== undefined && value !== null && value !== '') {
        return encodeURIComponent(String(value));
      }
      return `_${name}_`;
    });
  }

  handleRequestError(error: any): any {
    if (error.response) {
      return {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers
      };
    } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        status: 504,
        data: {
          error: {
            code: 'TIMEOUT',
            message: 'Request timeout (' + this.timeoutMs + 'ms)'
          }
        },
        headers: {}
      };
    } else if (error.code === 'ECONNREFUSED') {
      return {
        status: 503,
        data: {
          error: {
            code: 'UNAVAILABLE',
            message: 'Server not available'
          }
        },
        headers: {}
      };
    } else if (error.code === 'ENOTFOUND') {
      return {
        status: 503,
        data: {
          error: {
            code: 'UNAVAILABLE',
            message: 'Server not found'
          }
        },
        headers: {}
      };
    } else {
      return {
        status: 500,
        data: {
          error: {
            code: 'INTERNAL',
            message: error?.message ? String(error.message) : 'Internal server error'
          }
        },
        headers: {}
      };
    }
  }

  logRequest(path: string, method: string, params: any, status: number, duration: number): void {
    const logData = {
      method,
      path,
      params: this.redactParams(params),
      status,
      duration: duration < 1000 ? duration + 'ms' : (duration / 1000).toFixed(2) + 's'
    };

    // Altijd naar stderr: stdout is gereserveerd voor het MCP (JSON-RPC) protocol.
    console.error(JSON.stringify(logData));
  }

  redactParams(params: any): any {
    if (!params) return params;

    const result: any = {};

    Object.entries(params).forEach(([key, value]: [string, any]) => {
      if (key === fixedConfig.authHeader) {
        result[key] = '[REDACTED]';
      } else if (Array.isArray(value)) {
        result[key] = value.map(v => this.redactParamValue(v));
      } else {
        result[key] = this.redactParamValue(value);
      }
    });

    return result;
  }

  redactParamValue(value: any): any {
    if (value === null || value === undefined || value === '') {
      return value;
    }

    const strVal = String(value);

    if (strVal.startsWith('ga_live_') || strVal.startsWith('ga_test_')) {
      return '[API_KEY]';
    }

    return value;
  }
}
