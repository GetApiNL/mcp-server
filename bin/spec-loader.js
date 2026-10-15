/**
 * Spec Loader
 *
 * Ophaalt, valideert en beheert de GetApi spec.
 */
import axios from 'axios';
import { z } from 'zod';
import { fixedConfig } from './auth.js';
// Spec Hash Schema
const SpecHashSchema = z.object({
    hash: z.string().min(1),
    lastUpdated: z.string().datetime().optional(),
    valid: z.boolean().default(false)
});
// Spec Validation Schema  
const SpecValidationSchema = z.object({
    openapi: z.string().min(1),
    info: z.object({
        title: z.string().min(1),
        version: z.string().min(1)
    }),
    paths: z.record(z.any())
});
export class SpecLoader {
    apiKey;
    cache = null;
    lastCheck = 0;
    intervalId = null;
    timeoutMs = fixedConfig.timeoutMs;
    maxSpecSize = fixedConfig.maxSpecSize;
    constructor(apiKey, timeoutMs) {
        this.apiKey = apiKey;
        if (timeoutMs) {
            this.timeoutMs = timeoutMs;
        }
    }
    async fetchSpec() {
        const startTime = Date.now();
        try {
            const response = await axios.get(fixedConfig.specUrl, {
                headers: { 'X-Api-Key': this.apiKey },
                timeout: this.timeoutMs,
                validateStatus: (status) => status >= 200 && status < 600
            });
            const duration = Date.now() - startTime;
            if (response.data.length > this.maxSpecSize) {
                console.error(`Spec te groot: ${Math.round(response.data.length / 1024)} KB`);
                return null;
            }
            let spec;
            try {
                spec = JSON.parse(response.data);
            }
            catch (e) {
                console.error('Fout bij parsen van spec: ' + (e && e.message ? e.message : String(e)));
                return null;
            }
            const hash = this.computeHash(spec);
            if (!this.validateSpec(spec)) {
                console.error('Spec is ongeldig OpenAPI');
                return null;
            }
            const cleanSpec = this.excludeX402(spec);
            const newHash = this.computeHash(cleanSpec);
            return {
                spec: cleanSpec,
                hash: newHash,
                valid: true
            };
        }
        catch (e) {
            if (e.code === 'ECONNREFUSED') {
                console.error('Kunnen geen connectie maken met spec server');
            }
            else if (e.code === 'ETIMEDOUT' || e.code === 'ECONNABORTED') {
                console.error('Request naar spec server is time-out');
            }
            else if (e.response) {
                console.error(`Spec server ${e.response.status}: ${e.response.status === 401 ? 'ongeldige API-key' : 'onbekende fout'}`);
            }
            else {
                console.error('Fout bij ophalen spec: ' + (e && e.message ? e.message : String(e)));
            }
            return null;
        }
    }
    computeHash(spec) {
        const sorted = this.sortSpec(spec);
        return this.hashCode(JSON.stringify(sorted));
    }
    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash | 0;
        }
        return Math.abs(hash).toString(16).padStart(16, '0');
    }
    sortSpec(spec) {
        const sorted = JSON.parse(JSON.stringify(spec));
        if (sorted.info) {
            Object.keys(sorted.info).sort().forEach(key => {
                const val = sorted.info[key];
                if (typeof val === 'string')
                    sorted.info[key] = val;
                else if (Array.isArray(val))
                    sorted.info[key] = [...val].sort();
                else if (typeof val === 'object' && val !== null)
                    sorted.info[key] = this.sortObject(val);
            });
        }
        const paths = Object.keys(sorted.paths || {}).sort();
        const sortedPaths = {};
        paths.forEach((path) => {
            sortedPaths[path] = sorted.paths[path];
        });
        sorted.paths = sortedPaths;
        Object.keys(sortedPaths).forEach((path) => {
            if (Array.isArray(sortedPaths[path])) {
                sortedPaths[path] = sortedPaths[path].sort((a, b) => {
                    const amethod = (a && a.httpMethod) || '';
                    const bmethod = (b && b.httpMethod) || '';
                    return amethod.localeCompare(bmethod);
                });
            }
        });
        sorted.paths = sortedPaths;
        if (sorted.tags) {
            sorted.tags = sorted.tags.sort((a, b) => {
                const aname = (a && a.name) || '';
                const bname = (b && b.name) || '';
                return aname.localeCompare(bname);
            });
        }
        return sorted;
    }
    sortObject(obj) {
        const sorted = {};
        Object.keys(obj).sort().forEach((key) => {
            const val = obj[key];
            if (typeof val === 'string')
                sorted[key] = val;
            else if (Array.isArray(val))
                sorted[key] = [...val].sort();
            else if (typeof val === 'object' && val !== null)
                sorted[key] = this.sortObject(val);
        });
        return sorted;
    }
    validateSpec(spec) {
        try {
            SpecValidationSchema.parse(spec);
            return true;
        }
        catch (e) {
            if (e instanceof z.ZodError) {
                const messages = e.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join('; ');
                console.error('Spec-validatie mislukt: ' + messages);
            }
            else {
                console.error('Spec-validatie mislukt: ' + (e && e.message ? e.message : String(e)));
            }
            return false;
        }
    }
    excludeX402(spec) {
        const filteredPaths = {};
        Object.keys(spec.paths || {}).forEach((path) => {
            const pathItem = spec.paths[path];
            if (typeof pathItem === 'string') {
                filteredPaths[path] = pathItem;
            }
            else {
                const filteredPathItem = {};
                if (pathItem.get)
                    filteredPathItem.get = pathItem.get;
                if (pathItem.post)
                    filteredPathItem.post = pathItem.post;
                if (pathItem.put)
                    filteredPathItem.put = pathItem.put;
                if (pathItem.delete)
                    filteredPathItem.delete = pathItem.delete;
                if (pathItem.patch)
                    filteredPathItem.patch = pathItem.patch;
                if (pathItem.options)
                    filteredPathItem.options = pathItem.options;
                if (pathItem.head)
                    filteredPathItem.head = pathItem.head;
                if (pathItem.trace)
                    filteredPathItem.trace = pathItem.trace;
                if (Object.keys(filteredPathItem).length > 0) {
                    const pathItemOps = Object.values(filteredPathItem).filter(op => op && typeof op === 'object');
                    const has402 = pathItemOps.some((op) => {
                        const tags = op.tags || [];
                        return tags.some((tag) => {
                            if (typeof tag === 'object') {
                                return tag.name && tag.name.includes('x402');
                            }
                            return false;
                        });
                    });
                    if (!has402) {
                        filteredPaths[path] = filteredPathItem;
                    }
                }
            }
        });
        return {
            ...spec,
            paths: filteredPaths
        };
    }
    async load() {
        if (this.intervalId) {
            return this.cache;
        }
        const result = await this.fetchSpec();
        if (!result) {
            return { success: false, message: 'Kon geen spec ophalen' };
        }
        this.cache = {
            spec: result.spec,
            hash: result.hash,
            lastUpdated: new Date(),
            isValid: true,
            toolCount: this.countTools(result.spec)
        };
        this.lastCheck = Date.now();
        this.intervalId = setInterval(async () => {
            await this.refresh();
        }, fixedConfig.refreshIntervalMs);
        return this.cache;
    }
    async refresh() {
        if (!this.intervalId || !this.cache) {
            return { success: false, message: 'Geen cache' };
        }
        const result = await this.fetchSpec();
        if (!result) {
            console.warn('Spec refresh mislukt, gebruik laatste versie');
            return { success: false, message: 'Kan nieuwe spec niet ophalen' };
        }
        if (result.hash === this.cache.hash) {
            console.debug('Spec niet veranderd, gebruik cache');
            this.cache.lastUpdated = new Date();
            return { success: false, message: 'Spec niet veranderd' };
        }
        const newToolCount = this.countTools(result.spec);
        console.info(`Spec gewijzigd: ${result.spec.info?.version || 'nieuw'}`);
        this.cache = {
            spec: result.spec,
            hash: result.hash,
            lastUpdated: new Date(),
            isValid: true,
            toolCount: newToolCount
        };
        return { success: true, message: 'Spec vernieuwd' };
    }
    countTools(spec) {
        let count = 0;
        Object.values(spec.paths || {}).forEach((pathItem) => {
            if (typeof pathItem === 'string')
                return;
            Object.values(pathItem).forEach((op) => {
                if (op && op.operationId)
                    count++;
            });
        });
        return count;
    }
    async get() {
        if (this.cache && this.cache.isValid) {
            return this.cache;
        }
        const result = await this.fetchSpec();
        if (!result) {
            if (!this.cache) {
                return null;
            }
            return {
                spec: this.cache.spec,
                hash: this.cache.hash,
                error: 'Kan geen nieuwe spec ophalen, gebruik laatste versie'
            };
        }
        this.cache = {
            spec: result.spec,
            hash: result.hash,
            lastUpdated: result.lastUpdated || new Date(),
            isValid: result.valid,
            toolCount: result.toolCount
        };
        return this.cache;
    }
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
    getCache() {
        return this.cache;
    }
}
