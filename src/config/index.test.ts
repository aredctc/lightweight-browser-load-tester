/**
 * Unit tests for configuration management system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { ConfigurationManager, ConfigurationError } from './index';
import { TestConfiguration } from '../types';

describe('ConfigurationManager', () => {
  const testConfigDir = join(__dirname, '../../test-configs');
  const testFiles: string[] = [];

  beforeEach(() => {
    // Clear environment variables
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('LOAD_TEST_')) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    // Clean up test files
    testFiles.forEach(file => {
      if (existsSync(file)) {
        unlinkSync(file);
      }
    });
    testFiles.length = 0;
  });

  const createTestFile = (filename: string, content: string): string => {
    const filePath = join(testConfigDir, filename);
    writeFileSync(filePath, content);
    testFiles.push(filePath);
    return filePath;
  };

  describe('Default Configuration', () => {
    it('should provide valid default configuration', async () => {
      const result = await ConfigurationManager.parseConfiguration({ 
        validateOnly: true
      });
      
      expect(result.config).toMatchObject({
        concurrentUsers: 1,
        testDuration: 60,
        rampUpTime: 10,
        streamingUrl: '',
        requestParameters: [],
        resourceLimits: {
          maxMemoryPerInstance: 512,
          maxCpuPercentage: 80,
          maxConcurrentInstances: 10
        }
      });

      // All values should come from defaults
      expect(result.sources.concurrentUsers).toBe('default');
      expect(result.sources.testDuration).toBe('default');
      expect(result.sources.rampUpTime).toBe('default');
      expect(result.sources.streamingUrl).toBe('default');
    });

    it('should fail validation with empty streaming URL', async () => {
      await expect(
        ConfigurationManager.parseConfiguration({ validateOnly: false })
      ).rejects.toThrow(ConfigurationError);
    });
  });

  describe('JSON Configuration Files', () => {
    it('should parse valid JSON configuration', async () => {
      const config = {
        concurrentUsers: 5,
        testDuration: 300,
        rampUpTime: 30,
        streamingUrl: 'https://example.com/stream',
        resourceLimits: {
          maxMemoryPerInstance: 1024,
          maxCpuPercentage: 90,
          maxConcurrentInstances: 20
        }
      };

      const configFile = createTestFile('test-config.json', JSON.stringify(config));
      const result = await ConfigurationManager.parseConfiguration({ configFile });

      expect(result.config.concurrentUsers).toBe(5);
      expect(result.config.testDuration).toBe(300);
      expect(result.config.streamingUrl).toBe('https://example.com/stream');
      expect(result.sources.concurrentUsers).toBe('file');
    });

    it('should handle JSON with DRM configuration', async () => {
      const config = {
        concurrentUsers: 2,
        testDuration: 120,
        rampUpTime: 10,
        streamingUrl: 'https://example.com/stream',
        drmConfig: {
          type: 'widevine',
          licenseUrl: 'https://example.com/license',
          certificateUrl: 'https://example.com/cert'
        },
        resourceLimits: {
          maxMemoryPerInstance: 512,
          maxCpuPercentage: 80,
          maxConcurrentInstances: 10
        }
      };

      const configFile = createTestFile('drm-config.json', JSON.stringify(config));
      const result = await ConfigurationManager.parseConfiguration({ configFile });

      expect(result.config.drmConfig).toEqual({
        type: 'widevine',
        licenseUrl: 'https://example.com/license',
        certificateUrl: 'https://example.com/cert'
      });
    });

    it('should reject invalid JSON', async () => {
      const configFile = createTestFile('invalid.json', '{ invalid json }');
      
      await expect(
        ConfigurationManager.parseConfiguration({ configFile })
      ).rejects.toThrow(ConfigurationError);
    });
  });

  describe('YAML Configuration Files', () => {
    it('should parse valid YAML configuration', async () => {
      const yamlContent = `
concurrentUsers: 10
testDuration: 600
rampUpTime: 60
streamingUrl: https://example.com/yaml-stream
requestParameters:
  - target: header
    name: Authorization
    valueTemplate: Bearer {{token}}
    scope: per-session
resourceLimits:
  maxMemoryPerInstance: 2048
  maxCpuPercentage: 95
  maxConcurrentInstances: 50
`;

      const configFile = createTestFile('test-config.yaml', yamlContent);
      const result = await ConfigurationManager.parseConfiguration({ configFile });

      expect(result.config.concurrentUsers).toBe(10);
      expect(result.config.requestParameters).toHaveLength(1);
      expect(result.config.requestParameters[0]).toEqual({
        target: 'header',
        name: 'Authorization',
        valueTemplate: 'Bearer {{token}}',
        scope: 'per-session'
      });
    });

    it('should handle .yml extension', async () => {
      const yamlContent = `
concurrentUsers: 3
testDuration: 180
rampUpTime: 15
streamingUrl: https://example.com/yml-stream
resourceLimits:
  maxMemoryPerInstance: 512
  maxCpuPercentage: 80
  maxConcurrentInstances: 10
`;

      const configFile = createTestFile('test-config.yml', yamlContent);
      const result = await ConfigurationManager.parseConfiguration({ configFile });

      expect(result.config.concurrentUsers).toBe(3);
      expect(result.sources.concurrentUsers).toBe('file');
    });
  });

  describe('Environment Variables', () => {
    it('should load configuration from environment variables', async () => {
      process.env.LOAD_TEST_CONCURRENT_USERS = '15';
      process.env.LOAD_TEST_DURATION = '900';
      process.env.LOAD_TEST_STREAMING_URL = 'https://env.example.com/stream';
      process.env.LOAD_TEST_MAX_MEMORY = '1024';

      const result = await ConfigurationManager.parseConfiguration();

      expect(result.config.concurrentUsers).toBe(15);
      expect(result.config.testDuration).toBe(900);
      expect(result.config.streamingUrl).toBe('https://env.example.com/stream');
      expect(result.config.resourceLimits.maxMemoryPerInstance).toBe(1024);
      
      expect(result.sources.concurrentUsers).toBe('env');
      expect(result.sources.testDuration).toBe('env');
      expect(result.sources.streamingUrl).toBe('env');
    });

    it('should handle DRM environment variables', async () => {
      process.env.LOAD_TEST_CONCURRENT_USERS = '1';
      process.env.LOAD_TEST_DURATION = '60';
      process.env.LOAD_TEST_RAMP_UP = '10';
      process.env.LOAD_TEST_STREAMING_URL = 'https://example.com/stream';
      process.env.LOAD_TEST_DRM_TYPE = 'playready';
      process.env.LOAD_TEST_DRM_LICENSE_URL = 'https://example.com/pr-license';

      const result = await ConfigurationManager.parseConfiguration();

      expect(result.config.drmConfig).toEqual({
        type: 'playready',
        licenseUrl: 'https://example.com/pr-license'
      });
    });

    it('should parse boolean and numeric environment variables', async () => {
      process.env.LOAD_TEST_CONCURRENT_USERS = '25';
      process.env.LOAD_TEST_DURATION = '1800';
      process.env.LOAD_TEST_STREAMING_URL = 'https://example.com/stream';
      process.env.LOAD_TEST_MAX_CPU = '75.5';

      const result = await ConfigurationManager.parseConfiguration();

      expect(result.config.concurrentUsers).toBe(25);
      expect(result.config.testDuration).toBe(1800);
      expect(result.config.resourceLimits.maxCpuPercentage).toBe(75.5);
    });
  });

  describe('Command Line Arguments', () => {
    it('should parse command line arguments', async () => {
      const cliArgs = [
        '--concurrent-users', '20',
        '--test-duration', '1200',
        '--streaming-url', 'https://cli.example.com/stream',
        '--max-memory', '2048'
      ];

      const result = await ConfigurationManager.parseConfiguration({ cliArgs });

      expect(result.config.concurrentUsers).toBe(20);
      expect(result.config.testDuration).toBe(1200);
      expect(result.config.streamingUrl).toBe('https://cli.example.com/stream');
      expect(result.config.resourceLimits.maxMemoryPerInstance).toBe(2048);
      
      expect(result.sources.concurrentUsers).toBe('cli');
      expect(result.sources.testDuration).toBe('cli');
      expect(result.sources.streamingUrl).toBe('cli');
    });

    it('should handle DRM command line arguments', async () => {
      const cliArgs = [
        '--concurrent-users', '1',
        '--test-duration', '60',
        '--streaming-url', 'https://example.com/stream',
        '--drm-type', 'fairplay',
        '--drm-license-url', 'https://example.com/fp-license',
        '--drm-cert-url', 'https://example.com/fp-cert'
      ];

      const result = await ConfigurationManager.parseConfiguration({ cliArgs });

      expect(result.config.drmConfig).toEqual({
        type: 'fairplay',
        licenseUrl: 'https://example.com/fp-license',
        certificateUrl: 'https://example.com/fp-cert'
      });
    });
  });

  describe('Configuration Priority', () => {
    it('should prioritize CLI > ENV > FILE > DEFAULT', async () => {
      // Set up file config
      const fileConfig = {
        concurrentUsers: 5,
        testDuration: 300,
        rampUpTime: 30,
        streamingUrl: 'https://file.example.com/stream',
        resourceLimits: {
          maxMemoryPerInstance: 1024,
          maxCpuPercentage: 80,
          maxConcurrentInstances: 10
        }
      };
      const configFile = createTestFile('priority-test.json', JSON.stringify(fileConfig));

      // Set environment variables
      process.env.LOAD_TEST_CONCURRENT_USERS = '10';
      process.env.LOAD_TEST_STREAMING_URL = 'https://env.example.com/stream';

      // Set CLI arguments
      const cliArgs = ['--concurrent-users', '15'];

      const result = await ConfigurationManager.parseConfiguration({ configFile, cliArgs });

      // CLI should win for concurrentUsers
      expect(result.config.concurrentUsers).toBe(15);
      expect(result.sources.concurrentUsers).toBe('cli');

      // ENV should win for streamingUrl (no CLI override)
      expect(result.config.streamingUrl).toBe('https://env.example.com/stream');
      expect(result.sources.streamingUrl).toBe('env');

      // FILE should win for testDuration (no CLI or ENV override)
      expect(result.config.testDuration).toBe(300);
      expect(result.sources.testDuration).toBe('file');

      // DEFAULT should win for rampUpTime (no other source)
      expect(result.config.rampUpTime).toBe(30);
      expect(result.sources.rampUpTime).toBe('file');
    });
  });

  describe('Validation', () => {
    it('should validate required fields', async () => {
      const config = {
        // Missing required fields
        concurrentUsers: 5,
        testDuration: 300
        // Missing streamingUrl and resourceLimits
      };

      const configFile = createTestFile('invalid-config.json', JSON.stringify(config));
      
      await expect(
        ConfigurationManager.parseConfiguration({ configFile })
      ).rejects.toThrow(ConfigurationError);
    });

    it('should validate field types and ranges', async () => {
      const config = {
        concurrentUsers: -1, // Invalid: must be positive
        testDuration: 300,
        rampUpTime: 10,
        streamingUrl: 'not-a-url', // Invalid: must be valid URL
        resourceLimits: {
          maxMemoryPerInstance: 50, // Invalid: below minimum
          maxCpuPercentage: 150, // Invalid: above maximum
          maxConcurrentInstances: 10
        }
      };

      const configFile = createTestFile('validation-test.json', JSON.stringify(config));
      
      await expect(
        ConfigurationManager.parseConfiguration({ configFile })
      ).rejects.toThrow(ConfigurationError);
    });

    it('should validate DRM configuration', async () => {
      const config = {
        concurrentUsers: 1,
        testDuration: 60,
        rampUpTime: 10,
        streamingUrl: 'https://example.com/stream',
        drmConfig: {
          type: 'invalid-drm-type', // Invalid DRM type
          licenseUrl: 'not-a-url' // Invalid URL
        },
        resourceLimits: {
          maxMemoryPerInstance: 512,
          maxCpuPercentage: 80,
          maxConcurrentInstances: 10
        }
      };

      const configFile = createTestFile('drm-validation-test.json', JSON.stringify(config));
      
      await expect(
        ConfigurationManager.parseConfiguration({ configFile })
      ).rejects.toThrow(ConfigurationError);
    });

    it('should validate ramp up time vs test duration', async () => {
      const config = {
        concurrentUsers: 1,
        testDuration: 60,
        rampUpTime: 120, // Invalid: longer than test duration
        streamingUrl: 'https://example.com/stream',
        resourceLimits: {
          maxMemoryPerInstance: 512,
          maxCpuPercentage: 80,
          maxConcurrentInstances: 10
        }
      };

      const configFile = createTestFile('ramp-validation-test.json', JSON.stringify(config));
      
      await expect(
        ConfigurationManager.parseConfiguration({ configFile })
      ).rejects.toThrow('Ramp up time must be less than test duration');
    });

    it('should allow validation-only mode', async () => {
      const config = {
        concurrentUsers: 1,
        testDuration: 60,
        rampUpTime: 10,
        streamingUrl: '', // Invalid but should not throw in validation-only mode
        resourceLimits: {
          maxMemoryPerInstance: 512,
          maxCpuPercentage: 80,
          maxConcurrentInstances: 10
        }
      };

      const configFile = createTestFile('validation-only-test.json', JSON.stringify(config));
      
      // Should not throw in validation-only mode
      const result = await ConfigurationManager.parseConfiguration({ 
        configFile, 
        validateOnly: true 
      });
      
      expect(result.config.streamingUrl).toBe('');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing configuration file', async () => {
      await expect(
        ConfigurationManager.parseConfiguration({ configFile: 'non-existent.json' })
      ).rejects.toThrow(ConfigurationError);
    });

    it('should handle unsupported file format', async () => {
      const configFile = createTestFile('test-config.xml', '<config></config>');
      
      await expect(
        ConfigurationManager.parseConfiguration({ configFile })
      ).rejects.toThrow(ConfigurationError);
    });

    it('should provide detailed error messages', async () => {
      const config = {
        concurrentUsers: 'not-a-number',
        testDuration: 300,
        streamingUrl: 'https://example.com/stream'
      };

      const configFile = createTestFile('error-test.json', JSON.stringify(config));
      
      try {
        await ConfigurationManager.parseConfiguration({ configFile });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect(error.message).toContain('Configuration validation failed');
      }
    });
  });

  describe('Utility Functions', () => {
    it('should generate example configuration in JSON format', () => {
      const example = ConfigurationManager.generateExampleConfig('json');
      const parsed = JSON.parse(example);
      
      expect(parsed).toHaveProperty('concurrentUsers');
      expect(parsed).toHaveProperty('testDuration');
      expect(parsed).toHaveProperty('streamingUrl');
      expect(parsed).toHaveProperty('resourceLimits');
    });

    it('should generate example configuration in YAML format', () => {
      const example = ConfigurationManager.generateExampleConfig('yaml');
      
      expect(example).toContain('concurrentUsers:');
      expect(example).toContain('testDuration:');
      expect(example).toContain('streamingUrl:');
      expect(example).toContain('resourceLimits:');
    });

    it('should provide validation schema', () => {
      const schema = ConfigurationManager.getValidationSchema();
      expect(schema).toBeDefined();
      expect(typeof schema.validate).toBe('function');
    });
  });
});