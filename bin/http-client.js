/**
 * HTTP Client
 *
 * Voert HTTP verzoeken uit naar de GetApi server.
 */
import axios from 'axios';
import { fixedConfig } from './auth.js';
export class HttpClient {
    client;
    constructor(apiKey) {
        this.client = axios.create({
            baseURL: fixedConfig.baseUrl,
            timeout: fixedConfig.timeoutMs,
            headers: {
                'X-Api-Key': apiKey,
                'Content-Type': 'application/json'
            },
            maxBodyLength: fixedConfig.maxResponseSize,
            maxContentLength: fixedConfig.maxResponseSize,
            validateStatus: (status) => status >= 200 && status < 600
        });
        // Request interceptor voor host control
        this.client.interceptors.request.use((config) => {
            if (config.url) {
                const parsedUrl = new URL(config.url, fixedConfig.baseUrl);
                if (parsedUrl.origin !== fixedConfig.baseUrl) {
                    throw new Error('Host niet toegestaan: ' + config.url);
                }
            }
            return config;
        });
        // Response interceptor
        this.client.interceptors.response.use((response) => response, (error) => this.handleRequestError(error));
    }
    async request(path, params = {}, op = {}) {
        const startTime = Date.now();
        const method = op.method || 'GET';
        const url = this.buildUrl(path, params);
        const config = {
            method,
            url,
            params: params,
            timeout: fixedConfig.timeoutMs,
            headers: {},
            validateStatus: (status) => status >= 200 && status < 600,
            maxBodyLength: fixedConfig.maxResponseSize,
            maxContentLength: fixedConfig.maxResponseSize
        };
        try {
            const response = await this.client(config);
            // Check response size
            if (response.data) {
                const size = JSON.stringify(response.data).length;
                if (size > fixedConfig.maxResponseSize) {
                    throw new Error('Response te groot: ' + Math.round(size / 1024) + ' KB');
                }
            }
            const duration = Date.now() - startTime;
            // Log resultaat (zonder API-key)
            this.logRequest(path, method, params, response.status, response.headers, duration);
            return {
                status: response.status,
                data: response.data,
                headers: response.headers || {}
            };
        }
        catch (error) {
            if (error.response) {
                return {
                    status: error.response.status,
                    data: error.response.data,
                    headers: error.response.headers
                };
            }
            else if (error.code === 'ECONNABORTED') {
                return {
                    status: 504,
                    data: {
                        error: {
                            code: 'TIMEOUT',
                            message: 'Request timeout (' + fixedConfig.timeoutMs + 'ms)'
                        }
                    },
                    headers: {}
                };
            }
            else if (error.code === 'ECONNREFUSED') {
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
            }
            else if (error.code === 'ENOTFOUND') {
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
            }
            else {
                return {
                    status: 500,
                    data: {
                        error: {
                            code: 'INTERNAL',
                            message: 'Internal server error'
                        }
                    },
                    headers: {}
                };
            }
        }
    }
    buildUrl(path, params = {}) {
        const url = this.fillParams(path, params);
        return this.encodePath(url);
    }
    fillParams(path, params = {}) {
        let urlWithParams = path.replace(/\{([^}]+)\}/g, (_, name) => {
            const value = params[name];
            if (value !== undefined && value !== null && value !== '') {
                return encodeURIComponent(value);
            }
            return `_${name}_`;
        });
        const hasQuery = urlWithParams.includes('?');
        if (!hasQuery) {
            const query = Object.entries(params)
                .filter(([key]) => !urlWithParams.includes(`?${encodeURIComponent(key)}`))
                .map(([key, value]) => {
                if (value === undefined || value === null || value === '') {
                    return;
                }
                if (Array.isArray(value)) {
                    return `${encodeURIComponent(key)}=${value.join(',')}`;
                }
                return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
            })
                .filter(Boolean)
                .join('&');
            if (query) {
                urlWithParams += '?' + query;
            }
        }
        return urlWithParams;
    }
    encodePath(path) {
        return path.split('/').map(segment => {
            if (segment.match(/^\{|\}$/)) {
                return segment;
            }
            return encodeURIComponent(segment);
        }).join('/');
    }
    handleRequestError(error) {
        if (error.response) {
            return {
                status: error.response.status,
                data: error.response.data,
                headers: error.response.headers
            };
        }
        else if (error.code === 'ECONNABORTED') {
            return {
                status: 504,
                data: {
                    error: {
                        code: 'TIMEOUT',
                        message: 'Request timeout (' + fixedConfig.timeoutMs + 'ms)'
                    }
                },
                headers: {}
            };
        }
        else if (error.code === 'ECONNREFUSED') {
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
        }
        else if (error.code === 'ENOTFOUND') {
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
        }
        else {
            return {
                status: 500,
                data: {
                    error: {
                        code: 'INTERNAL',
                        message: 'Internal server error'
                    }
                },
                headers: {}
            };
        }
    }
    handleErrorResponse(response) {
        return {
            status: response.status,
            data: response.data,
            headers: response.headers
        };
    }
    logRequest(path, method, params, status, headers, duration) {
        const logData = {
            method,
            path,
            params: this.redactParams(params),
            status,
            duration: duration < 1000 ? duration + 'ms' : (duration / 1000).toFixed(2) + 's'
        };
        console.error(JSON.stringify(logData));
    }
    redactParams(params) {
        if (!params)
            return params;
        const result = {};
        Object.entries(params).forEach(([key, value]) => {
            if (key === 'X-Api-Key') {
                result[key] = '[REDACTED]';
            }
            else if (Array.isArray(value)) {
                result[key] = value.map(v => this.redactParamValue(v));
            }
            else {
                result[key] = this.redactParamValue(value);
            }
        });
        return result;
    }
    redactParamValue(value) {
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
