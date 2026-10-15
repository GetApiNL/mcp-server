/**
 * Tool Builder
 *
 * Omzet OpenAPI operaties naar MCP tools.
 */
import { z } from 'zod';
import { fixedConfig } from './auth.js';
import { HttpClient } from './http-client.js';
export class ToolBuilder {
    specLoader;
    apiKey;
    constructor(specLoader, apiKey) {
        this.specLoader = specLoader;
        this.apiKey = apiKey;
    }
    async buildTools() {
        await this.specLoader.load();
        const spec = this.specLoader.getCache().spec;
        if (!spec) {
            throw new Error('No spec available');
        }
        const toolDefs = [];
        const x402Paths = new Set();
        Object.entries(spec.paths || {}).forEach(([path, pathItem]) => {
            if (typeof pathItem === 'string')
                return;
            Object.entries(pathItem).forEach(([method, op]) => {
                if (!op || !op.operationId)
                    return;
                const tags = op.tags || [];
                if (tags.some((tag) => {
                    if (typeof tag === 'object') {
                        return tag.name && tag.name.includes('x402');
                    }
                    return false;
                })) {
                    x402Paths.add(path);
                }
            });
        });
        Object.entries(spec.paths || {}).forEach(([path, pathItem]) => {
            if (typeof pathItem === 'string')
                return;
            if (x402Paths.has(path))
                return;
            Object.entries(pathItem).forEach(([method, op]) => {
                if (!op || !op.operationId)
                    return;
                const toolDef = this.buildToolDefinition(path, op);
                toolDefs.push(toolDef);
            });
        });
        return toolDefs;
    }
    buildToolDefinition(path, op) {
        const paramsSchema = this.buildParamsSchema(path, op.parameters, op.requestBody);
        const handler = async (args) => {
            const result = await this.executeCall(path, args, op, paramsSchema);
            return result;
        };
        return {
            name: this.buildToolName(op.operationId),
            paramsSchema,
            handler
        };
    }
    buildToolName(operationId) {
        const parts = operationId
            .split('.')
            .map((part) => {
            let result = part;
            result = result.replace(/([a-z])([A-Z])/g, '$1_$2');
            result = result.replace(/([A-Z])([A-Z][a-z])/g, '$1_$2');
            return result.toLowerCase();
        })
            .join('_');
        return 'getapi_' + parts;
    }
    buildParamsSchema(path, parameters = [], requestBody) {
        const schema = {};
        parameters.forEach((param) => {
            if (param.in === 'cookie')
                return;
            if (!param.schema || param.schema.type === 'object')
                return;
            const schemaType = this.mapOpenAPIToZod(param.schema);
            const meta = {
                [param.in]: true,
                required: param.required || false
            };
            if (param.in === 'path') {
                schema[param.name] = schemaType.meta
                    ? schemaType.meta.minimum !== undefined
                        ? schemaType.meta
                        : { type: 'string' }
                    : { type: 'string' };
                schema[param.name].meta = { ...meta, path: true };
            }
            else if (param.in === 'header') {
                if (param.name !== fixedConfig.authHeader) {
                    schema[param.name] = schemaType.meta
                        ? schemaType.meta
                        : { type: 'string', optional: true };
                    schema[param.name].meta = { ...meta, header: true, autoIncluded: true };
                }
            }
            else if (param.in === 'query') {
                schema[param.name] = schemaType.meta
                    ? schemaType.meta
                    : { type: 'string', optional: true, nullable: true };
                schema[param.name].meta = meta;
            }
        });
        // Request body
        if (requestBody && requestBody.content) {
            Object.entries(requestBody.content).forEach(([mediaType, contentSpec]) => {
                if (mediaType === 'application/json') {
                    const bodySchema = this.mapOpenAPIToZod(contentSpec.schema || {});
                    const meta = {
                        body: true,
                        required: requestBody.required || false
                    };
                    // Add restrictions
                    const restrictions = this.buildRestrictions(contentSpec.schema || {});
                    // Merge restrictions into schema
                    const schemaClone = {};
                    Object.keys(schema).forEach((key) => {
                        if (key !== 'body') {
                            schemaClone[key] = schema[key];
                        }
                    });
                    schema.body = bodySchema;
                    schema.body.meta = meta;
                    // Merge restrictions
                    Object.keys(restrictions).forEach((key) => {
                        if (!schema[key] && key !== 'required' && key !== 'body') {
                            schema[key] = restrictions[key];
                        }
                    });
                }
            });
        }
        return z.object(schema);
    }
    mapOpenAPIToZod(schema) {
        if (!schema) {
            return z.any();
        }
        const type = schema.type;
        if (type === 'object') {
            const objSchema = {};
            if (schema.properties) {
                Object.entries(schema.properties).forEach(([propName, propSchema]) => {
                    objSchema[propName] = this.mapOpenAPIToZod(propSchema);
                });
            }
            if (schema.required) {
                schema.required.forEach((propName) => {
                    if (!objSchema[propName]) {
                        objSchema[propName] = z.any();
                    }
                });
            }
            return z.object(objSchema);
        }
        if (type === 'array') {
            return schema.items ? this.mapOpenAPIToZod(schema.items) : z.array(z.any());
        }
        if (type === 'string') {
            return z.string();
        }
        if (type === 'number') {
            return z.number();
        }
        if (type === 'integer') {
            return z.number().int();
        }
        if (type === 'boolean') {
            return z.boolean();
        }
        if (type === 'null') {
            return z.null().nullish();
        }
        return z.any();
    }
    buildRestrictions(schema) {
        const restrictions = {};
        if (schema.enum) {
            restrictions.enum = schema.enum;
        }
        if (schema.pattern) {
            restrictions.pattern = schema.pattern;
        }
        if (schema.minimum !== undefined) {
            restrictions.minimum = schema.minimum;
        }
        if (schema.maximum !== undefined) {
            restrictions.maximum = schema.maximum;
        }
        if (schema.minLength !== undefined) {
            restrictions.minLength = schema.minLength;
        }
        if (schema.maxLength !== undefined) {
            restrictions.maxLength = schema.maxLength;
        }
        return restrictions;
    }
    async executeCall(path, args, op, paramsSchema) {
        const http = new HttpClient(this.apiKey);
        const validatedParams = paramsSchema.safeParse(args);
        if (!validatedParams.success) {
            // Return MCP-formatted error
            return {
                content: [
                    { type: 'text', text: 'Parameter validation failed: ' + (validatedParams.error?.message || 'Unknown error') }
                ],
                isError: true
            };
        }
        const params = validatedParams.data;
        const result = await http.request(path, params, op);
        return this.parseResponse(result);
    }
    parseResponse(result) {
        const status = result.status;
        if (status >= 200 && status < 300) {
            return {
                content: [
                    { type: 'text', text: JSON.stringify(result.data) }
                ],
                isError: false
            };
        }
        else {
            const message = result.data?.message || result.data?.error?.message || 'Error';
            return {
                content: [
                    { type: 'text', text: 'Error: ' + message }
                ],
                isError: true
            };
        }
    }
}
