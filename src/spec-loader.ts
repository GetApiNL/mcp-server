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
  apiKey: string;
  cache: any = null;
  lastCheck: number = 0;
  intervalId: NodeJS.Timeout | null = null;
  timeoutMs: number = fixedConfig.timeoutMs;
  maxSpecSize: number = fixedConfig.maxSpecSize;
  
  constructor(apiKey: string, timeoutMs?: number) {
    this.apiKey = apiKey;
    if (timeoutMs) {
      this.timeoutMs = timeoutMs;
    }
  }
  
  async fetchSpec(): Promise<any> {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(fixedConfig.specUrl, {
        headers: { 'X-Api-Key': this.apiKey },
        timeout: this.timeoutMs,
        validateStatus: (status: number) => status >= 200 && status < 600
      });
      
      const duration = Date.now() - startTime;
      
      // Controleer Content-Type header
      const contentType = response.headers['content-type']?.toString() || '';
      if (!contentType.includes('application/json')) {
        console.warn(`Content-Type is niet JSON: ${contentType}`);
        console.error('Geen JSON response van spec server.');
        return null;
      }
      
      if (typeof response.data === 'string') {
        if (response.data.length > this.maxSpecSize) {
          console.error(`Spec te groot: ${Math.round(response.data.length / 1024)} KB`);
          return null;
        }
        
        let spec: any;
        try {
          spec = JSON.parse(response.data);
        } catch (e: any) {
          console.error(`Fout bij parsen van spec: ${response.data.substring(0, 200)}...`);
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
      } else if (typeof response.data === 'object') {
        // Axios kan soms direct een object retourneren
        if (this.validateSpec(response.data)) {
          const cleanSpec = this.excludeX402(response.data);
          const newHash = this.computeHash(cleanSpec);
          return { spec: cleanSpec, hash: newHash, valid: true };
        }
      } else {
        console.error('Onverwacht response type: ' + typeof response.data);
        return null;
      }
    } catch (e: any) {
      if (e.code === 'ECONNREFUSED') {
        console.error('Kunnen geen connectie maken met spec server');
      } else if (e.code === 'ETIMEDOUT' || e.code === 'ECONNABORTED') {
        console.error('Request naar spec server is time-out');
      } else if (e.response) {
        console.error(`Spec server ${e.response.status}: ${e.response.status === 401 ? 'ongeldige API-key' : 'onbekende fout'}`);
      } else {
        console.error('Fout bij ophalen spec: ' + (e && e.message ? e.message : String(e)));
      }
      return null;
    }
  }
  
  computeHash(spec: any): string {
    const sorted = this.sortSpec(spec);
    return this.hashCode(JSON.stringify(sorted));
  }
  
  hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash | 0;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }
  
  sortSpec(spec: any): any {
    const sorted = JSON.parse(JSON.stringify(spec));
    
    if (sorted.info) {
      Object.keys(sorted.info).sort().forEach(key => {
        const val = sorted.info[key];
        if (typeof val === 'string') sorted.info[key] = val;
        else if (Array.isArray(val)) sorted.info[key] = [...val].sort();
        else if (typeof val === 'object' && val !== null) sorted.info[key] = this.sortObject(val);
      });
    }
    
    const paths = sorted.paths || {};
    const sortedPaths: any = {};
    Object.keys(paths).sort().forEach(path => {
      sortedPaths[path] = paths[path];
    });
    
    return {
      ...sorted,
      paths: sortedPaths
    };
  }
  
  sortObject(obj: any): any {
    const sorted: any = {};
    
    if (typeof obj === 'object' && obj !== null) {
      Object.keys(obj).sort().forEach(key => {
        sorted[key] = obj[key];
      });
    }
    
    return sorted;
  }
  
  validateSpec(spec: any): boolean {
    try {
      const result = SpecValidationSchema.safeParse(spec);
      return result.success;
    } catch (e) {
      return false;
    }
  }
  
  excludeX402(spec: any): any {
    const excludeSet = new Set([...fixedConfig.x402ExcludedOperations]);
    const cleanSpec: any = { ...spec };
    
    if (cleanSpec.paths) {
      Object.keys(cleanSpec.paths).forEach(path => {
        const pathItem = cleanSpec.paths[path];
        if (typeof pathItem === 'object') {
          const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];
          methods.forEach(method => {
            const op = pathItem[method];
            if (op && op.operationId && excludeSet.has(op.operationId)) {
              delete pathItem[method];
            }
          });
        }
      });
    }
    
    return cleanSpec;
  }
  
  async load(): Promise<void> {
    const specData = await this.fetchSpec();
    
    if (!specData) {
      this.cache = null;
      return;
    }
    
    const { spec, hash } = specData;
    
    if (this.cache?.hash === hash) {
      return;
    }
    
    this.cache = specData;
    this.lastCheck = Date.now();
  }
  
  refresh(): Promise<void> {
    return this.load();
  }
  
  getCache(): any {
    return this.cache;
  }
  
  startAutoRefresh(): void {
    this.intervalId = setInterval(async () => {
      await this.refresh();
    }, fixedConfig.refreshIntervalMs);
  }
  
  stopAutoRefresh(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  
  async invalidateCache(): Promise<void> {
    this.stopAutoRefresh();
    this.cache = null;
  }
}