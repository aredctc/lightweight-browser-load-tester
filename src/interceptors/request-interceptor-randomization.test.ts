import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Page } from 'playwright';
import { RequestInterceptor, VariableContext } from './request-interceptor';
import { ParameterTemplate } from '../types';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('RequestInterceptor - Randomization Features', () => {
    let mockPage: Page;
    let interceptor: RequestInterceptor;
    let testDataDir: string;

    beforeEach(() => {
        // Create mock page
        mockPage = {
            route: vi.fn(),
            on: vi.fn(),
            unroute: vi.fn()
        } as any;

        // Create test data directory
        testDataDir = join(process.cwd(), 'test-data-temp');
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

    describe('Random Functions', () => {
        it('should generate UUID with {{random:uuid}}', () => {
            const templates: ParameterTemplate[] = [{
                target: 'header',
                name: 'X-Request-ID',
                valueTemplate: '{{random:uuid}}',
                scope: 'per-session'
            }];

            interceptor = new RequestInterceptor(mockPage, templates);

            // Access private method for testing
            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            const result = substituteVariables('{{random:uuid}}');

            expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        });

        it('should generate random number with {{random:number}}', () => {
            const templates: ParameterTemplate[] = [{
                target: 'header',
                name: 'X-Random-Number',
                valueTemplate: '{{random:number}}',
                scope: 'per-session'
            }];

            interceptor = new RequestInterceptor(mockPage, templates);

            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            const result = substituteVariables('{{random:number}}');

            const number = parseInt(result, 10);
            expect(number).toBeGreaterThanOrEqual(0);
            expect(number).toBeLessThan(1000000);
        });

        it('should generate timestamp with {{random:timestamp}}', () => {
            const templates: ParameterTemplate[] = [{
                target: 'header',
                name: 'X-Timestamp',
                valueTemplate: '{{random:timestamp}}',
                scope: 'per-session'
            }];

            interceptor = new RequestInterceptor(mockPage, templates);

            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            const result = substituteVariables('{{random:timestamp}}');

            const timestamp = parseInt(result, 10);
            expect(timestamp).toBeGreaterThan(Date.now() - 1000);
            expect(timestamp).toBeLessThanOrEqual(Date.now());
        });

        it('should generate hex string with {{random:hex}}', () => {
            const templates: ParameterTemplate[] = [{
                target: 'header',
                name: 'X-Hex-ID',
                valueTemplate: '{{random:hex}}',
                scope: 'per-session'
            }];

            interceptor = new RequestInterceptor(mockPage, templates);

            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            const result = substituteVariables('{{random:hex}}');

            expect(result).toMatch(/^[0-9a-f]+$/);
            expect(result.length).toBeGreaterThan(0);
        });

        it('should generate alphanumeric string with {{random:alphanumeric}}', () => {
            const templates: ParameterTemplate[] = [{
                target: 'header',
                name: 'X-Session-Token',
                valueTemplate: '{{random:alphanumeric}}',
                scope: 'per-session'
            }];

            interceptor = new RequestInterceptor(mockPage, templates);

            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            const result = substituteVariables('{{random:alphanumeric}}');

            expect(result).toMatch(/^[A-Za-z0-9]{8}$/);
        });

        it('should generate number in range with {{random:1-100}}', () => {
            const templates: ParameterTemplate[] = [{
                target: 'query',
                name: 'userId',
                valueTemplate: '{{random:1-100}}',
                scope: 'per-session'
            }];

            interceptor = new RequestInterceptor(mockPage, templates);

            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            
            // Test multiple times to ensure range is respected
            for (let i = 0; i < 10; i++) {
                const result = substituteVariables('{{random:1-100}}');
                const number = parseInt(result, 10);
                expect(number).toBeGreaterThanOrEqual(1);
                expect(number).toBeLessThanOrEqual(100);
            }
        });

        it('should handle unknown random function gracefully', () => {
            const templates: ParameterTemplate[] = [{
                target: 'header',
                name: 'X-Unknown',
                valueTemplate: '{{random:unknown}}',
                scope: 'per-session'
            }];

            interceptor = new RequestInterceptor(mockPage, templates);

            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            const result = substituteVariables('{{random:unknown}}');

            expect(result).toBe('random:unknown');
        });
    });

    describe('RandomFrom Functions', () => {
        it('should select random value from array with {{randomFrom:arrayName}}', () => {
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
            ];

            const templates: ParameterTemplate[] = [{
                target: 'header',
                name: 'User-Agent',
                valueTemplate: '{{randomFrom:userAgents}}',
                scope: 'per-session'
            }];

            const context: Partial<VariableContext> = {
                userAgents
            };

            interceptor = new RequestInterceptor(mockPage, templates, context);

            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            const result = substituteVariables('{{randomFrom:userAgents}}');

            expect(userAgents).toContain(result);
        });

        it('should handle non-array variable gracefully', () => {
            const templates: ParameterTemplate[] = [{
                target: 'header',
                name: 'X-Value',
                valueTemplate: '{{randomFrom:notAnArray}}',
                scope: 'per-session'
            }];

            const context: Partial<VariableContext> = {
                notAnArray: 'string value'
            };

            interceptor = new RequestInterceptor(mockPage, templates, context);

            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            const result = substituteVariables('{{randomFrom:notAnArray}}');

            expect(result).toBe('randomFrom:notAnArray');
        });

        it('should handle empty array gracefully', () => {
            const templates: ParameterTemplate[] = [{
                target: 'header',
                name: 'X-Value',
                valueTemplate: '{{randomFrom:emptyArray}}',
                scope: 'per-session'
            }];

            const context: Partial<VariableContext> = {
                emptyArray: []
            };

            interceptor = new RequestInterceptor(mockPage, templates, context);

            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            const result = substituteVariables('{{randomFrom:emptyArray}}');

            expect(result).toBe('randomFrom:emptyArray');
        });

        it('should handle missing array variable gracefully', () => {
            const templates: ParameterTemplate[] = [{
                target: 'header',
                name: 'X-Value',
                valueTemplate: '{{randomFrom:missingArray}}',
                scope: 'per-session'
            }];

            interceptor = new RequestInterceptor(mockPage, templates);

            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            const result = substituteVariables('{{randomFrom:missingArray}}');

            expect(result).toBe('randomFrom:missingArray');
        });
    });

    describe('RandomFromFile Functions', () => {
        it('should select random value from file with {{randomFromFile:path}}', () => {
            const testValues = ['value1', 'value2', 'value3', 'value4'];
            const testFile = join(testDataDir, 'test-values.txt');
            writeFileSync(testFile, testValues.join('\n'));

            const templates: ParameterTemplate[] = [{
                target: 'header',
                name: 'X-Random-Value',
                valueTemplate: `{{randomFromFile:${testFile}}}`,
                scope: 'per-session'
            }];

            interceptor = new RequestInterceptor(mockPage, templates);

            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            const result = substituteVariables(`{{randomFromFile:${testFile}}}`);

            expect(testValues).toContain(result);
        });

        it('should filter out empty lines and comments', () => {
            const testFile = join(testDataDir, 'test-with-comments.txt');
            const fileContent = [
                'value1',
                '',
                '# This is a comment',
                'value2',
                '   ',
                'value3',
                '# Another comment',
                'value4'
            ].join('\n');
            writeFileSync(testFile, fileContent);

            const templates: ParameterTemplate[] = [{
                target: 'header',
                name: 'X-Random-Value',
                valueTemplate: `{{randomFromFile:${testFile}}}`,
                scope: 'per-session'
            }];

            interceptor = new RequestInterceptor(mockPage, templates);

            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            
            // Test multiple times to ensure only valid values are returned
            const validValues = ['value1', 'value2', 'value3', 'value4'];
            for (let i = 0; i < 10; i++) {
                const result = substituteVariables(`{{randomFromFile:${testFile}}}`);
                expect(validValues).toContain(result);
            }
        });

        it('should cache file data and reuse it', () => {
            const testValues = ['cached1', 'cached2', 'cached3'];
            const testFile = join(testDataDir, 'cached-values.txt');
            writeFileSync(testFile, testValues.join('\n'));

            const templates: ParameterTemplate[] = [{
                target: 'header',
                name: 'X-Cached-Value',
                valueTemplate: `{{randomFromFile:${testFile}}}`,
                scope: 'per-session'
            }];

            interceptor = new RequestInterceptor(mockPage, templates);

            // Test caching behavior through multiple substitutions
            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            
            // First call should read from file
            const firstResult = substituteVariables(`{{randomFromFile:${testFile}}}`);
            expect(testValues).toContain(firstResult);

            // Second call should use cached data (we can't test reference equality, 
            // but we can verify it works consistently)
            const secondResult = substituteVariables(`{{randomFromFile:${testFile}}}`);
            expect(testValues).toContain(secondResult);
        });

        it('should handle non-existent file gracefully', () => {
            const nonExistentFile = join(testDataDir, 'non-existent.txt');

            const templates: ParameterTemplate[] = [{
                target: 'header',
                name: 'X-Missing-File',
                valueTemplate: `{{randomFromFile:${nonExistentFile}}}`,
                scope: 'per-session'
            }];

            interceptor = new RequestInterceptor(mockPage, templates);

            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            const result = substituteVariables(`{{randomFromFile:${nonExistentFile}}}`);

            expect(result).toBe(`randomFromFile:${nonExistentFile}`);
        });

        it('should handle empty file gracefully', () => {
            const emptyFile = join(testDataDir, 'empty.txt');
            writeFileSync(emptyFile, '');

            const templates: ParameterTemplate[] = [{
                target: 'header',
                name: 'X-Empty-File',
                valueTemplate: `{{randomFromFile:${emptyFile}}}`,
                scope: 'per-session'
            }];

            interceptor = new RequestInterceptor(mockPage, templates);

            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            const result = substituteVariables(`{{randomFromFile:${emptyFile}}}`);

            expect(result).toBe(`randomFromFile:${emptyFile}`);
        });
    });

    describe('Combined Template Usage', () => {
        it('should handle multiple random functions in single template', () => {
            const templates: ParameterTemplate[] = [{
                target: 'header',
                name: 'X-Complex-Header',
                valueTemplate: 'session_{{random:uuid}}_{{random:number}}_{{sessionId}}',
                scope: 'per-session'
            }];

            interceptor = new RequestInterceptor(mockPage, templates);

            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            const result = substituteVariables('session_{{random:uuid}}_{{random:number}}_{{sessionId}}');

            expect(result).toMatch(/^session_[0-9a-f-]{36}_\d+_session_\d+$/);
        });

        it('should handle mixed random and context variables', () => {
            const authTokens = ['token1', 'token2', 'token3'];
            
            const templates: ParameterTemplate[] = [{
                target: 'header',
                name: 'Authorization',
                valueTemplate: 'Bearer {{randomFrom:authTokens}}_{{random:alphanumeric}}',
                scope: 'per-session'
            }];

            const context: Partial<VariableContext> = {
                authTokens
            };

            interceptor = new RequestInterceptor(mockPage, templates, context);

            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            const result = substituteVariables('Bearer {{randomFrom:authTokens}}_{{random:alphanumeric}}');

            expect(result).toMatch(/^Bearer (token1|token2|token3)_[A-Za-z0-9]{8}$/);
        });

        it('should work with all parameter targets (header, query, body)', () => {
            const deviceIds = ['device1', 'device2', 'device3'];
            const testFile = join(testDataDir, 'api-keys.txt');
            writeFileSync(testFile, 'key1\nkey2\nkey3');

            const templates: ParameterTemplate[] = [
                {
                    target: 'header',
                    name: 'X-Device-ID',
                    valueTemplate: '{{randomFrom:deviceIds}}',
                    scope: 'per-session'
                },
                {
                    target: 'query',
                    name: 'apiKey',
                    valueTemplate: `{{randomFromFile:${testFile}}}`,
                    scope: 'per-session'
                },
                {
                    target: 'body',
                    name: 'requestId',
                    valueTemplate: '{{random:uuid}}',
                    scope: 'per-session'
                }
            ];

            const context: Partial<VariableContext> = {
                deviceIds
            };

            interceptor = new RequestInterceptor(mockPage, templates, context);

            // Test header substitution
            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            const headerResult = substituteVariables('{{randomFrom:deviceIds}}');
            expect(deviceIds).toContain(headerResult);

            // Test query substitution
            const queryResult = substituteVariables(`{{randomFromFile:${testFile}}}`);
            expect(['key1', 'key2', 'key3']).toContain(queryResult);

            // Test body substitution
            const bodyResult = substituteVariables('{{random:uuid}}');
            expect(bodyResult).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        });
    });

    describe('Error Handling', () => {
        it('should log errors for failed substitutions', () => {
            const templates: ParameterTemplate[] = [{
                target: 'header',
                name: 'X-Test',
                valueTemplate: '{{randomFromFile:/nonexistent/file.txt}}',
                scope: 'per-session'
            }];

            interceptor = new RequestInterceptor(mockPage, templates);

            // Directly call substituteVariables to trigger the error
            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            const result = substituteVariables('{{randomFromFile:/nonexistent/file.txt}}');

            // The result should be the original template (indicating failure)
            expect(result).toBe('randomFromFile:/nonexistent/file.txt');

            // Check that errors were logged
            const errors = interceptor.getErrors();
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(error => error.message.includes('Failed to load file data'))).toBe(true);
        });

        it('should continue processing other templates when one fails', () => {
            const validValues = ['value1', 'value2'];
            
            const templates: ParameterTemplate[] = [
                {
                    target: 'header',
                    name: 'X-Valid',
                    valueTemplate: '{{randomFrom:validValues}}',
                    scope: 'per-session'
                },
                {
                    target: 'header',
                    name: 'X-Invalid',
                    valueTemplate: '{{randomFromFile:/invalid/path}}',
                    scope: 'per-session'
                }
            ];

            const context: Partial<VariableContext> = {
                validValues
            };

            interceptor = new RequestInterceptor(mockPage, templates, context);

            const substituteVariables = (interceptor as any).substituteVariables.bind(interceptor);
            
            // Valid template should still work
            const validResult = substituteVariables('{{randomFrom:validValues}}');
            expect(validValues).toContain(validResult);

            // Invalid template should return original expression
            const invalidResult = substituteVariables('{{randomFromFile:/invalid/path}}');
            expect(invalidResult).toBe('randomFromFile:/invalid/path');
        });
    });
});