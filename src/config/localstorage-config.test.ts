import { describe, it, expect } from 'vitest';
import { ConfigurationManager } from './index';

describe('localStorage Configuration', () => {
    describe('validation', () => {
        it('should validate valid localStorage configuration', async () => {
            const config = {
                concurrentUsers: 1,
                testDuration: 60,
                rampUpTime: 10,
                streamingUrl: 'https://example.com/stream',
                localStorage: [
                    {
                        domain: 'example.com',
                        data: {
                            'auth_token': 'token123',
                            'user_id': '456'
                        }
                    }
                ],
                resourceLimits: {
                    maxMemoryPerInstance: 512,
                    maxCpuPercentage: 80,
                    maxConcurrentInstances: 10
                }
            };

            // Use schema validation directly instead of parseConfiguration
            const schema = ConfigurationManager.getValidationSchema();
            const { error } = schema.validate(config);

            // Should not have validation errors
            expect(error).toBeUndefined();
        });

        it('should validate multiple localStorage domains', async () => {
            const validConfig = {
                concurrentUsers: 1,
                testDuration: 60,
                rampUpTime: 10,
                streamingUrl: 'https://example.com/stream',
                localStorage: [
                    {
                        domain: 'app.example.com',
                        data: {
                            'session_id': 'sess123'
                        }
                    },
                    {
                        domain: 'api.example.com',
                        data: {
                            'api_key': 'key456',
                            'version': 'v2'
                        }
                    }
                ],
                resourceLimits: {
                    maxMemoryPerInstance: 512,
                    maxCpuPercentage: 80,
                    maxConcurrentInstances: 10
                }
            };

            // Should validate without errors
            const schema = ConfigurationManager.getValidationSchema();
            const { error } = schema.validate(validConfig);
            expect(error).toBeUndefined();
        });

        it('should reject localStorage with missing domain', async () => {
            const invalidConfig = {
                concurrentUsers: 1,
                testDuration: 60,
                rampUpTime: 10,
                streamingUrl: 'https://example.com/stream',
                localStorage: [
                    {
                        // Missing domain
                        data: {
                            'auth_token': 'token123'
                        }
                    }
                ],
                resourceLimits: {
                    maxMemoryPerInstance: 512,
                    maxCpuPercentage: 80,
                    maxConcurrentInstances: 10
                }
            };

            const schema = ConfigurationManager.getValidationSchema();
            const { error } = schema.validate(invalidConfig);
            expect(error).toBeDefined();
            expect(error?.details[0].message).toContain('domain');
        });

        it('should reject localStorage with missing data', async () => {
            const invalidConfig = {
                concurrentUsers: 1,
                testDuration: 60,
                rampUpTime: 10,
                streamingUrl: 'https://example.com/stream',
                localStorage: [
                    {
                        domain: 'example.com'
                        // Missing data
                    }
                ],
                resourceLimits: {
                    maxMemoryPerInstance: 512,
                    maxCpuPercentage: 80,
                    maxConcurrentInstances: 10
                }
            };

            const schema = ConfigurationManager.getValidationSchema();
            const { error } = schema.validate(invalidConfig);
            expect(error).toBeDefined();
            expect(error?.details[0].message).toContain('data');
        });

        it('should reject localStorage with non-string data values', async () => {
            const invalidConfig = {
                concurrentUsers: 1,
                testDuration: 60,
                rampUpTime: 10,
                streamingUrl: 'https://example.com/stream',
                localStorage: [
                    {
                        domain: 'example.com',
                        data: {
                            'auth_token': 'token123',
                            'user_id': 456, // Should be string
                            'is_active': true // Should be string
                        }
                    }
                ],
                resourceLimits: {
                    maxMemoryPerInstance: 512,
                    maxCpuPercentage: 80,
                    maxConcurrentInstances: 10
                }
            };

            const schema = ConfigurationManager.getValidationSchema();
            const { error } = schema.validate(invalidConfig);
            expect(error).toBeDefined();
            expect(error?.details.some(detail => detail.message.includes('string'))).toBe(true);
        });

        it('should accept empty localStorage array', async () => {
            const validConfig = {
                concurrentUsers: 1,
                testDuration: 60,
                rampUpTime: 10,
                streamingUrl: 'https://example.com/stream',
                localStorage: [], // Empty array should be valid
                resourceLimits: {
                    maxMemoryPerInstance: 512,
                    maxCpuPercentage: 80,
                    maxConcurrentInstances: 10
                }
            };

            const schema = ConfigurationManager.getValidationSchema();
            const { error } = schema.validate(validConfig);
            expect(error).toBeUndefined();
        });

        it('should use default empty array when localStorage is not specified', async () => {
            const configWithoutLocalStorage = {
                concurrentUsers: 1,
                testDuration: 60,
                rampUpTime: 10,
                streamingUrl: 'https://example.com/stream',
                resourceLimits: {
                    maxMemoryPerInstance: 512,
                    maxCpuPercentage: 80,
                    maxConcurrentInstances: 10
                }
            };

            const schema = ConfigurationManager.getValidationSchema();
            const { error, value } = schema.validate(configWithoutLocalStorage);

            expect(error).toBeUndefined();
            expect(value.localStorage).toEqual([]);
        });
    });

    describe('example configuration generation', () => {
        it('should include localStorage in generated YAML example', () => {
            const yamlExample = ConfigurationManager.generateExampleConfig('yaml');

            expect(yamlExample).toContain('localStorage:');
            expect(yamlExample).toContain('domain: example.com');
            expect(yamlExample).toContain('auth_token:');
            expect(yamlExample).toContain('user_id:');
            expect(yamlExample).toContain('session_id:');
        });

        it('should include localStorage in generated JSON example', () => {
            const jsonExample = ConfigurationManager.generateExampleConfig('json');
            const parsed = JSON.parse(jsonExample);

            expect(parsed.localStorage).toBeDefined();
            expect(Array.isArray(parsed.localStorage)).toBe(true);
            expect(parsed.localStorage.length).toBeGreaterThan(0);

            const firstEntry = parsed.localStorage[0];
            expect(firstEntry.domain).toBeDefined();
            expect(firstEntry.data).toBeDefined();
            expect(typeof firstEntry.data).toBe('object');
        });
    });

    describe('complex localStorage scenarios', () => {
        it('should validate localStorage with JSON-stringified values', async () => {
            const config = {
                concurrentUsers: 1,
                testDuration: 60,
                rampUpTime: 10,
                streamingUrl: 'https://example.com/stream',
                localStorage: [
                    {
                        domain: 'complex.example.com',
                        data: {
                            'user_preferences': '{"theme":"dark","language":"en"}',
                            'cart_items': '[{"id":"123","quantity":2}]',
                            'simple_value': 'test'
                        }
                    }
                ],
                resourceLimits: {
                    maxMemoryPerInstance: 512,
                    maxCpuPercentage: 80,
                    maxConcurrentInstances: 10
                }
            };

            const schema = ConfigurationManager.getValidationSchema();
            const { error } = schema.validate(config);
            expect(error).toBeUndefined();
        });

        it('should validate localStorage with many domains', async () => {
            const localStorage = [];
            for (let i = 0; i < 10; i++) {
                localStorage.push({
                    domain: `domain${i}.example.com`,
                    data: {
                        [`key${i}`]: `value${i}`,
                        'common_key': 'common_value'
                    }
                });
            }

            const config = {
                concurrentUsers: 1,
                testDuration: 60,
                rampUpTime: 10,
                streamingUrl: 'https://example.com/stream',
                localStorage,
                resourceLimits: {
                    maxMemoryPerInstance: 512,
                    maxCpuPercentage: 80,
                    maxConcurrentInstances: 10
                }
            };

            const schema = ConfigurationManager.getValidationSchema();
            const { error } = schema.validate(config);
            expect(error).toBeUndefined();
        });

        it('should validate localStorage with empty data object', async () => {
            const config = {
                concurrentUsers: 1,
                testDuration: 60,
                rampUpTime: 10,
                streamingUrl: 'https://example.com/stream',
                localStorage: [
                    {
                        domain: 'empty.example.com',
                        data: {} // Empty data object should be valid
                    }
                ],
                resourceLimits: {
                    maxMemoryPerInstance: 512,
                    maxCpuPercentage: 80,
                    maxConcurrentInstances: 10
                }
            };

            const schema = ConfigurationManager.getValidationSchema();
            const { error } = schema.validate(config);
            expect(error).toBeUndefined();
        });
    });
});