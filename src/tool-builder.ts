/**
 * Tool Builder
 * 
 * Omzet OpenAPI operaties naar MCP tools.
 */

import { z } from 'zod';
import type { ZodTypeAny, ZodRawShape } from 'zod';
import { fixedConfig } from './auth.js';
import { HttpClient } from './http-client.js';
import type { ParamLocation } from './http-client.js';

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  handler: (args: any) => Promise<any>;
};

export class ToolBuilder {
  specLoader: any;
  apiKey: string;
  http: HttpClient;

  constructor(specLoader: any, apiKey: string) {
    this.specLoader = specLoader;
    this.apiKey = apiKey;
    this.http = new HttpClient(apiKey);
  }

  async buildTools(): Promise<ToolDefinition[]> {
    await this.specLoader.load();
    const spec = this.specLoader.getCache()?.spec;

    if (!spec) {
      throw new Error('No spec available');
    }

    const toolDefs: ToolDefinition[] = [];

    Object.entries(spec.paths || {}).forEach(([path, pathItem]: [string, any]) => {
      if (typeof pathItem === 'string' || !pathItem || typeof pathItem !== 'object') return;

      Object.entries(pathItem).forEach(([method, op]: [string, any]) => {
        if (method === 'parameters' || method === 'summary' || method === 'description') return;
        if (!op || typeof op !== 'object' || !op.operationId) return;

        if (this.isX402(op)) return;

        toolDefs.push(this.buildToolDefinition(path, method, op));
      });
    });

    return toolDefs;
  }

  isX402(op: any): boolean {
    if (op.x402) return true;
    const tags = op.tags || [];
    return tags.some((tag: any) => {
      const name = typeof tag === 'string' ? tag : tag?.name;
      return typeof name === 'string' && name.includes('x402');
    });
  }

  buildToolDefinition(path: string, method: string, op: any): ToolDefinition {
    const { shape, locations } = this.buildParamsSchema(op.parameters, op.requestBody);

    const handler = async (args: any) => {
      return this.executeCall(path, method, args, op, shape, locations);
    };

    return {
      name: this.buildToolName(op.operationId),
      description: this.buildDescription(path, method, op),
      inputSchema: shape,
      handler
    };
  }

  buildDescription(path: string, method: string, op: any): string {
    const summary = op.summary || op.description || op.operationId;
    return `${summary} [${method.toUpperCase()} ${path}]`;
  }

  buildToolName(operationId: string): string {
    const parts = String(operationId)
      .split('.')
      .map((part: string) => {
        let result = part;
        result = result.replace(/([a-z])([A-Z])/g, '$1_$2');
        result = result.replace(/([A-Z])([A-Z][a-z])/g, '$1_$2');
        return result.toLowerCase();
      })
      .join('_');

    return 'getapi_' + parts;
  }

  buildParamsSchema(parameters: any[] = [], requestBody?: any): { shape: ZodRawShape; locations: Record<string, ParamLocation> } {
    const shape: ZodRawShape = {};
    const locations: Record<string, ParamLocation> = {};

    (parameters || []).forEach((param: any) => {
      if (!param || !param.name) return;
      if (param.in === 'cookie') return;
      if (param.in === 'header' && param.name === fixedConfig.authHeader) return;

      let zodType: ZodTypeAny = this.mapOpenAPIToZod(param.schema);

      const required = param.in === 'path' ? true : !!param.required;
      if (!required) {
        zodType = zodType.optional();
      }
      if (param.description) {
        zodType = zodType.describe(param.description);
      }

      shape[param.name] = zodType;
      locations[param.name] = param.in === 'path' || param.in === 'query' || param.in === 'header'
        ? param.in
        : 'query';
    });

    if (requestBody && requestBody.content) {
      const jsonContent = requestBody.content['application/json'];
      if (jsonContent) {
        let bodyType = this.mapOpenAPIToZod(jsonContent.schema || {});
        if (!requestBody.required) {
          bodyType = bodyType.optional();
        }
        shape['body'] = bodyType;
        locations['body'] = 'body';
      }
    }

    return { shape, locations };
  }

  mapOpenAPIToZod(schema: any): ZodTypeAny {
    if (!schema || typeof schema !== 'object') {
      return z.any();
    }

    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
      const literals = schema.enum
        .filter((v: any) => ['string', 'number', 'boolean'].includes(typeof v))
        .map((v: any) => z.literal(v));
      if (literals.length === schema.enum.length && literals.length > 1) {
        return z.union(literals as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
      }
      if (literals.length === 1) {
        return literals[0];
      }
    }

    const type = schema.type;

    if (type === 'object' || schema.properties) {
      const objSchema: ZodRawShape = {};

      if (schema.properties) {
        Object.entries(schema.properties).forEach(([propName, propSchema]: [string, any]) => {
          objSchema[propName] = this.mapOpenAPIToZod(propSchema);
        });
      }

      if (Array.isArray(schema.required)) {
        schema.required.forEach((propName: string) => {
          if (!objSchema[propName]) {
            objSchema[propName] = z.any();
          }
        });
      }

      return z.object(objSchema);
    }

    switch (type) {
      case 'array':
        return z.array(schema.items ? this.mapOpenAPIToZod(schema.items) : z.any());
      case 'string': {
        let str: any = z.string();
        if (schema.minLength !== undefined) str = str.min(schema.minLength);
        if (schema.maxLength !== undefined) str = str.max(schema.maxLength);
        if (schema.pattern) {
          try {
            str = str.regex(new RegExp(schema.pattern));
          } catch {
            // Ongeldige regex in spec: negeer de pattern-restrictie.
          }
        }
        return str;
      }
      case 'number': {
        let num: any = z.number();
        if (schema.minimum !== undefined) num = num.min(schema.minimum);
        if (schema.maximum !== undefined) num = num.max(schema.maximum);
        return num;
      }
      case 'integer': {
        let int: any = z.number().int();
        if (schema.minimum !== undefined) int = int.min(schema.minimum);
        if (schema.maximum !== undefined) int = int.max(schema.maximum);
        return int;
      }
      case 'boolean':
        return z.boolean();
      case 'null':
        return z.null();
      default:
        return z.any();
    }
  }

  async executeCall(
    path: string,
    method: string,
    args: any,
    op: any,
    shape: ZodRawShape,
    locations: Record<string, ParamLocation>
  ): Promise<any> {
    const validated = z.object(shape).safeParse(args ?? {});

    if (!validated.success) {
      return {
        content: [
          { type: 'text', text: 'Parameter validation failed: ' + validated.error.message }
        ],
        isError: true
      };
    }

    const result = await this.http.request(path, validated.data, { ...op, method }, locations);

    return this.parseResponse(result);
  }

  parseResponse(result: any): any {
    const status = result.status;

    if (status >= 200 && status < 300) {
      const data = result.data === undefined ? null : result.data;
      return {
        content: [
          { type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }
        ],
        isError: false
      };
    }

    const message =
      result.data?.error?.message ||
      result.data?.message ||
      (typeof result.data === 'string' ? result.data : 'Error');

    return {
      content: [
        { type: 'text', text: `Error ${status}: ${message}` }
      ],
      isError: true
    };
  }
}
