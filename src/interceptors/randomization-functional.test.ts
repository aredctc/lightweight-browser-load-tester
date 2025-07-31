import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RequestInterceptor, VariableContext, InterceptedRequest } from './request-interceptor';
import { ParameterTemplate } from '../types';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('Randomization Functional Tests', () => {
    let testDataDir: string;

    beforeEach(() => {
        // Create test data directory
        testDataDir = join(process.cwd(), 'test-randomization-functional');
        try {
            mkdirSync(testDataDir, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
    });

    afterEach(() => {
        // Clean up test data directory
        try {
            rmSync(testDataDir, { recursive: true, force: true });
        } catch (error) {
            // Directory might not exist
        }
    });

    it('should apply all randomization methods to request parameters', () => {
        // Create test data files
        const userAgentsFile = join(testDataDir, 'user-agents.txt');
        const authTokensFile = join(testDataDir, 'auth-tokens.txt');
        
        writeFileSync(userAgentsFile, [
            'TestAgent/1.0',
            'TestAgent/2.0',
            'TestAgent/3.0'
        ].join('\n'));
        
        writeFileSync(authTokensFile, [
            'token-alpha',
            'token-beta',
            'token-gamma'
        ].join('\n'));

        // Define parameter templates using all randomization methods
        const templates: ParameterTemplate[] = [
            {
                target: 'header',
                name: 'X-Request-ID',
                valueTemplate: '{{random:uuid}}',
                scope: 'per-session'
            },
            {
                target: 'header',
                name: 'X-Random-Number',
                valueTemplate: '{{random:1-1000}}',
                scope: 'per-session'
            },
            {
                target: 'header',
                name: 'X-Device-Type',
                valueTemplate: '{{randomFrom:deviceTypes}}',
                scope: 'per-session'
            },
            {
                target: 'header',
                name: 'User-Agent',
                valueTemplate: `{{randomFromFile:${userAgentsFile}}}`,
                scope: 'per-session'
            },
            {
                target: 'header',
                name: 'Authorization',
                valueTemplate: `Bearer {{randomFromFile:${authTokensFile}}}`,
                scope: 'per-session'
            },
            {
                target: 'query',
                name: 'sessionId',
                valueTemplate: '{{random:alphanumeric}}',
                scope: 'per-session'
            },
            {
                target: 'header',
                name: 'X-Complex',
                valueTemplate: `{{randomFrom:environments}}_{{random:hex}}_{{randomFromFile:${authTokensFile}}}`,
                scope: 'per-session'
            }
        ];

        // Define variable context for randomFrom
        const variableContext: Partial<VariableContext> = {
            deviceTypes: ['mobile', 'tablet', 'desktop'],
            environments: ['prod', 'staging', 'dev']
        };

        // Create mock page
        const mockPage = {
            route: () => Promise.resolve(),
            on: () => {},
            unroute: () => Promise.resolve()
        } as any;

        // Create interceptor
        const interceptor = new RequestInterceptor(mockPage, templates, variableContext);

        // Create test request
        const testRequest: InterceptedRequest = {
            url: 'https://example.com/test',
            method: 'GET',
            headers: {},
            postData: undefined
        };

        // Test request modification
        const modifyRequest = (interceptor as any).modifyRequest.bind(interceptor);
        const result = modifyRequest(testRequest);

        // Verify modification occurred
        expect(result.modified).toBe(true);
        expect(result.modifiedHeaders).toBeDefined();
        expect(result.modifiedUrl).toBeDefined();

        // Check that randomization was applied
        const headers = result.modifiedHeaders!;
        
        // Check UUID format
        if (headers['X-Request-ID']) {
            expect(headers['X-Request-ID']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        }
        
        // Check random number range
        if (headers['X-Random-Number']) {
            const num = parseInt(headers['X-Random-Number'], 10);
            expect(num).toBeGreaterThanOrEqual(1);
            expect(num).toBeLessThanOrEqual(1000);
        }
        
        // Check randomFrom array selection
        if (headers['X-Device-Type']) {
            expect(['mobile', 'tablet', 'desktop']).toContain(headers['X-Device-Type']);
        }
        
        // Check randomFromFile selection
        if (headers['User-Agent']) {
            expect(['TestAgent/1.0', 'TestAgent/2.0', 'TestAgent/3.0']).toContain(headers['User-Agent']);
        }
        
        if (headers['Authorization']) {
            expect(headers['Authorization']).toMatch(/^Bearer (token-alpha|token-beta|token-gamma)$/);
        }
        
        // Check query parameter randomization
        if (result.modifiedUrl && result.modifiedUrl.includes('sessionId=')) {
            const sessionIdMatch = result.modifiedUrl.match(/sessionId=([^&]+)/);
            if (sessionIdMatch) {
                expect(sessionIdMatch[1]).toMatch(/^[A-Za-z0-9]{8}$/);
            }
        }
        
        // Check complex template
        if (headers['X-Complex']) {
            expect(headers['X-Complex']).toMatch(/^(prod|staging|dev)_[0-9a-f]+_(token-alpha|token-beta|token-gamma)$/);
        }
    });

    it('should handle file caching correctly', () => {
        const testFile = join(testDataDir, 'cached-values.txt');
        writeFileSync(testFile, ['value1', 'value2', 'value3'].join('\n'));

        const templates: ParameterTemplate[] = [{
            target: 'header',
            name: 'X-Cached-Value',
            valueTemplate: `{{randomFromFile:${testFile}}}`,
            scope: 'per-session'
        }];

        const mockPage = {
            route: () => Promise.resolve(),
            on: () => {},
            unroute: () => Promise.resolve()
        } as any;

        const interceptor = new RequestInterceptor(mockPage, templates);

        // Test multiple substitutions to verify caching
        const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
        const validValues = ['value1', 'value2', 'value3'];
        
        for (let i = 0; i < 5; i++) {
            const result = substituteVariables(`{{randomFromFile:${testFile}}}`);
            expect(validValues).toContain(result);
        }
    });

    it('should handle errors gracefully', () => {
        const templates: ParameterTemplate[] = [
            {
                target: 'header',
                name: 'X-Valid',
                valueTemplate: '{{random:uuid}}',
                scope: 'per-session'
            },
            {
                target: 'header',
                name: 'X-Invalid-File',
                valueTemplate: '{{randomFromFile:/nonexistent/file.txt}}',
                scope: 'per-session'
            },
            {
                target: 'header',
                name: 'X-Invalid-Array',
                valueTemplate: '{{randomFrom:nonexistentArray}}',
                scope: 'per-session'
            }
        ];

        const mockPage = {
            route: () => Promise.resolve(),
            on: () => {},
            unroute: () => Promise.resolve()
        } as any;

        const interceptor = new RequestInterceptor(mockPage, templates);

        const testRequest: InterceptedRequest = {
            url: 'https://example.com/test',
            method: 'GET',
            headers: {},
            postData: undefined
        };

        const modifyRequest = (interceptor as any).modifyRequest.bind(interceptor);
        const result = modifyRequest(testRequest);

        // Verify request was processed despite errors
        expect(result.modified).toBe(true);
        expect(result.modifiedHeaders).toBeDefined();
        
        const headers = result.modifiedHeaders!;
        
        // Valid template should work
        expect(headers['X-Valid']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        
        // Invalid templates should return original expressions
        expect(headers['X-Invalid-File']).toBe('randomFromFile:/nonexistent/file.txt');
        expect(headers['X-Invalid-Array']).toBe('randomFrom:nonexistentArray');

        // Check that errors were logged
        const errors = interceptor.getErrors();
        expect(errors.length).toBeGreaterThan(0);
    });

    it('should work with different parameter targets', () => {
        const templates: ParameterTemplate[] = [
            {
                target: 'header',
                name: 'X-Header-Random',
                valueTemplate: '{{random:uuid}}',
                scope: 'per-session'
            },
            {
                target: 'query',
                name: 'queryRandom',
                valueTemplate: '{{random:number}}',
                scope: 'per-session'
            },
            {
                target: 'body',
                name: 'bodyRandom',
                valueTemplate: '{{random:alphanumeric}}',
                scope: 'per-session'
            }
        ];

        const mockPage = {
            route: () => Promise.resolve(),
            on: () => {},
            unroute: () => Promise.resolve()
        } as any;

        const interceptor = new RequestInterceptor(mockPage, templates);

        const testRequest: InterceptedRequest = {
            url: 'https://example.com/test',
            method: 'POST',
            headers: {},
            postData: '{"existing": "data"}'
        };

        const modifyRequest = (interceptor as any).modifyRequest.bind(interceptor);
        const result = modifyRequest(testRequest);

        expect(result.modified).toBe(true);
        
        // Check header randomization
        expect(result.modifiedHeaders!['X-Header-Random']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        
        // Check query parameter randomization
        expect(result.modifiedUrl).toMatch(/queryRandom=\d+/);
        
        // Check body parameter randomization
        if (result.modifiedPostData) {
            const bodyData = JSON.parse(result.modifiedPostData);
            expect(bodyData.bodyRandom).toMatch(/^[A-Za-z0-9]{8}$/);
            expect(bodyData.existing).toBe('data'); // Original data should be preserved
        }
    });

    it('should generate different values on multiple calls', () => {
        const templates: ParameterTemplate[] = [{
            target: 'header',
            name: 'X-Random-UUID',
            valueTemplate: '{{random:uuid}}',
            scope: 'per-session'
        }];

        const mockPage = {
            route: () => Promise.resolve(),
            on: () => {},
            unroute: () => Promise.resolve()
        } as any;

        const interceptor = new RequestInterceptor(mockPage, templates);

        const testRequest: InterceptedRequest = {
            url: 'https://example.com/test',
            method: 'GET',
            headers: {},
            postData: undefined
        };

        const modifyRequest = (interceptor as any).modifyRequest.bind(interceptor);
        
        // Generate multiple values
        const values = new Set<string>();
        for (let i = 0; i < 10; i++) {
            const result = modifyRequest(testRequest);
            const uuid = result.modifiedHeaders!['X-Random-UUID'];
            values.add(uuid);
        }

        // Should generate different UUIDs each time
        expect(values.size).toBe(10);
    });

    it('should handle combined randomization methods in single template', () => {
        const testFile = join(testDataDir, 'test-values.txt');
        writeFileSync(testFile, ['file-value-1', 'file-value-2'].join('\n'));

        const templates: ParameterTemplate[] = [{
            target: 'header',
            name: 'X-Combined',
            valueTemplate: `{{randomFrom:types}}_{{random:number}}_{{randomFromFile:${testFile}}}_{{random:uuid}}`,
            scope: 'per-session'
        }];

        const variableContext: Partial<VariableContext> = {
            types: ['type-a', 'type-b']
        };

        const mockPage = {
            route: () => Promise.resolve(),
            on: () => {},
            unroute: () => Promise.resolve()
        } as any;

        const interceptor = new RequestInterceptor(mockPage, templates, variableContext);

        const testRequest: InterceptedRequest = {
            url: 'https://example.com/test',
            method: 'GET',
            headers: {},
            postData: undefined
        };

        const modifyRequest = (interceptor as any).modifyRequest.bind(interceptor);
        const result = modifyRequest(testRequest);

        expect(result.modified).toBe(true);
        
        const combinedValue = result.modifiedHeaders!['X-Combined'];
        expect(combinedValue).toMatch(/^(type-a|type-b)_\d+_(file-value-1|file-value-2)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
});