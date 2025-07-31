/**
 * Tests for configuration management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigurationManager, ConfigurationError } from './index';

describe('Configuration Management', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('basic configuration validation', () => {
    it('should validate required configuration fields', async () => {
      const _validConfig = {
        concurrentUsers: 5,
        testDuration: 300,
        rampUpTime: 30,
        streamingUrl: 'https://example.com/stream',
        resourceLimits: {
          maxMemoryPerInstance: 512,
          maxCpuPercentage: 80,
          maxConcurrentInstances: 10
        }
      };

      const { config } = await ConfigurationManager.parseConfiguration({
        cliArgs: ['--streaming-url', 'https://example.com/stream']
      });

      // Should have default values for optional fields
      expect(config.streamingOnly).toBe(false);
      expect(config.allowedUrls).toEqual([]);
      expect(config.blockedUrls).toEqual([]);
      expect(config.requestParameters).toEqual([]);
    });

    it('should reject configuration with missing required fields', async () => {
      const _invalidConfig = {
        concurrentUsers: 5,
        testDuration: 300
        // Missing streamingUrl and resourceLimits
      };

      await expect(
        ConfigurationManager.parseConfiguration({
          cliArgs: ['--concurrent-users', '5', '--test-duration', '300']
        })
      ).rejects.toThrow(ConfigurationError);
    });

    it('should validate streaming-only boolean field', async () => {
      const { config } = await ConfigurationManager.parseConfiguration({
        cliArgs: [
          '--streaming-url', 'https://example.com/stream',
          '--concurrent-users', '1',
          '--test-duration', '60',
          '--ramp-up-time', '10',
          '--max-memory', '512',
          '--max-cpu', '80',
          '--max-instances', '10',
          '--streaming-only'
        ]
      });

      expect(config.streamingOnly).toBe(true);
    });
  });

  describe('URL filtering configuration', () => {
    it('should parse allowed URLs from CLI arguments', async () => {
      const { config } = await ConfigurationManager.parseConfiguration({
        cliArgs: [
          '--streaming-url', 'https://example.com/stream',
          '--concurrent-users', '1',
          '--test-duration', '60',
          '--ramp-up-time', '10',
          '--max-memory', '512',
          '--max-cpu', '80',
          '--max-instances', '10',
          '--allowed-urls', '*.css,*fonts*,/api/essential/'
        ]
      });

      expect(config.allowedUrls).toEqual(['*.css', '*fonts*', '/api/essential/']);
    });

    it('should parse blocked URLs from CLI arguments', async () => {
      const { config } = await ConfigurationManager.parseConfiguration({
        cliArgs: [
          '--streaming-url', 'https://example.com/stream',
          '--concurrent-users', '1',
          '--test-duration', '60',
          '--ramp-up-time', '10',
          '--max-memory', '512',
          '--max-cpu', '80',
          '--max-instances', '10',
          '--blocked-urls', '*analytics*,*tracking*,/ads/'
        ]
      });

      expect(config.blockedUrls).toEqual(['*analytics*', '*tracking*', '/ads/']);
    });

    it('should handle empty URL patterns gracefully', async () => {
      const { config } = await ConfigurationManager.parseConfiguration({
        cliArgs: [
          '--streaming-url', 'https://example.com/stream',
          '--concurrent-users', '1',
          '--test-duration', '60',
          '--ramp-up-time', '10',
          '--max-memory', '512',
          '--max-cpu', '80',
          '--max-instances', '10',
          '--allowed-urls', '',
          '--blocked-urls', '  ,  ,  '
        ]
      });

      expect(config.allowedUrls).toEqual([]);
      expect(config.blockedUrls).toEqual([]);
    });

    it('should trim whitespace from URL patterns', async () => {
      const { config } = await ConfigurationManager.parseConfiguration({
        cliArgs: [
          '--streaming-url', 'https://example.com/stream',
          '--concurrent-users', '1',
          '--test-duration', '60',
          '--ramp-up-time', '10',
          '--max-memory', '512',
          '--max-cpu', '80',
          '--max-instances', '10',
          '--allowed-urls', ' *.css , *fonts* , /api/essential/ '
        ]
      });

      expect(config.allowedUrls).toEqual(['*.css', '*fonts*', '/api/essential/']);
    });
  });

  describe('environment variable support', () => {
    it('should load streaming-only from environment variable', async () => {
      process.env.LOAD_TEST_STREAMING_ONLY = 'true';
      process.env.LOAD_TEST_STREAMING_URL = 'https://example.com/stream';
      process.env.LOAD_TEST_CONCURRENT_USERS = '1';
      process.env.LOAD_TEST_DURATION = '60';
      process.env.LOAD_TEST_RAMP_UP = '10';
      process.env.LOAD_TEST_MAX_MEMORY = '512';
      process.env.LOAD_TEST_MAX_CPU = '80';
      process.env.LOAD_TEST_MAX_INSTANCES = '10';

      const { config } = await ConfigurationManager.parseConfiguration({
        cliArgs: []
      });

      expect(config.streamingOnly).toBe(true);
    });

    it('should load URL patterns from environment variables', async () => {
      process.env.LOAD_TEST_ALLOWED_URLS = '*.css,*fonts*';
      process.env.LOAD_TEST_BLOCKED_URLS = '*analytics*,*tracking*';
      process.env.LOAD_TEST_STREAMING_URL = 'https://example.com/stream';
      process.env.LOAD_TEST_CONCURRENT_USERS = '1';
      process.env.LOAD_TEST_DURATION = '60';
      process.env.LOAD_TEST_RAMP_UP = '10';
      process.env.LOAD_TEST_MAX_MEMORY = '512';
      process.env.LOAD_TEST_MAX_CPU = '80';
      process.env.LOAD_TEST_MAX_INSTANCES = '10';

      const { config } = await ConfigurationManager.parseConfiguration({
        cliArgs: []
      });

      expect(config.allowedUrls).toEqual(['*.css', '*fonts*']);
      expect(config.blockedUrls).toEqual(['*analytics*', '*tracking*']);
    });

    it('should prioritize CLI arguments over environment variables', async () => {
      process.env.LOAD_TEST_STREAMING_ONLY = 'false';
      process.env.LOAD_TEST_ALLOWED_URLS = '*.css';

      const { config } = await ConfigurationManager.parseConfiguration({
        cliArgs: [
          '--streaming-url', 'https://example.com/stream',
          '--concurrent-users', '1',
          '--test-duration', '60',
          '--ramp-up-time', '10',
          '--max-memory', '512',
          '--max-cpu', '80',
          '--max-instances', '10',
          '--streaming-only',
          '--allowed-urls', '*fonts*'
        ]
      });

      expect(config.streamingOnly).toBe(true); // CLI overrides env
      expect(config.allowedUrls).toEqual(['*fonts*']); // CLI overrides env
    });
  });

  describe('configuration file support', () => {
    it('should generate example configuration with URL filtering options', () => {
      const yamlConfig = ConfigurationManager.generateExampleConfig('yaml');
      const jsonConfig = ConfigurationManager.generateExampleConfig('json');

      expect(yamlConfig).toContain('streamingOnly:');
      expect(yamlConfig).toContain('allowedUrls:');
      expect(yamlConfig).toContain('blockedUrls:');

      expect(jsonConfig).toContain('"streamingOnly"');
      expect(jsonConfig).toContain('"allowedUrls"');
      expect(jsonConfig).toContain('"blockedUrls"');
    });
  });

  describe('validation schema', () => {
    it('should validate URL arrays correctly', async () => {
      const _validConfig = {
        concurrentUsers: 1,
        testDuration: 60,
        rampUpTime: 10,
        streamingUrl: 'https://example.com/stream',
        streamingOnly: true,
        allowedUrls: ['*.css', '*fonts*'],
        blockedUrls: ['*analytics*', '*tracking*'],
        resourceLimits: {
          maxMemoryPerInstance: 512,
          maxCpuPercentage: 80,
          maxConcurrentInstances: 10
        }
      };

      // Should not throw
      const schema = ConfigurationManager.getValidationSchema();
      const { error } = schema.validate(_validConfig);
      expect(error).toBeUndefined();
    });

    it('should reject invalid URL array types', async () => {
      const _invalidConfig = {
        concurrentUsers: 1,
        testDuration: 60,
        rampUpTime: 10,
        streamingUrl: 'https://example.com/stream',
        allowedUrls: 'not-an-array', // Should be array
        resourceLimits: {
          maxMemoryPerInstance: 512,
          maxCpuPercentage: 80,
          maxConcurrentInstances: 10
        }
      };

      const schema = ConfigurationManager.getValidationSchema();
      const { error } = schema.validate(_invalidConfig);
      expect(error).toBeDefined();
      expect(error?.details[0].path).toContain('allowedUrls');
    });

    it('should set default values for optional fields', async () => {
      const minimalConfig = {
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
      const { value } = schema.validate(minimalConfig);

      expect(value.streamingOnly).toBe(false);
      expect(value.allowedUrls).toEqual([]);
      expect(value.blockedUrls).toEqual([]);
      expect(value.requestParameters).toEqual([]);
    });
  });

  describe('configuration source tracking', () => {
    it('should track configuration sources correctly', async () => {
      process.env.LOAD_TEST_STREAMING_ONLY = 'true';

      const { config: _config, sources } = await ConfigurationManager.parseConfiguration({
        cliArgs: [
          '--streaming-url', 'https://example.com/stream',
          '--concurrent-users', '1',
          '--test-duration', '60',
          '--ramp-up-time', '10',
          '--max-memory', '512',
          '--max-cpu', '80',
          '--max-instances', '10',
          '--allowed-urls', '*.css'
        ]
      });

      expect(sources.streamingUrl).toBe('cli');
      expect(sources.streamingOnly).toBe('env');
      expect(sources.allowedUrls).toBe('cli');
      expect(sources.blockedUrls).toBe('default');
    });
  });

  describe('error handling', () => {
    it('should throw ConfigurationError for invalid streaming URL', async () => {
      await expect(
        ConfigurationManager.parseConfiguration({
          cliArgs: [
            '--streaming-url', 'not-a-valid-url',
            '--concurrent-users', '1',
            '--test-duration', '60',
            '--ramp-up-time', '10',
            '--max-memory', '512',
            '--max-cpu', '80',
            '--max-instances', '10'
          ]
        })
      ).rejects.toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError for invalid concurrent users', async () => {
      await expect(
        ConfigurationManager.parseConfiguration({
          cliArgs: [
            '--streaming-url', 'https://example.com/stream',
            '--concurrent-users', '0', // Invalid: must be >= 1
            '--test-duration', '60',
            '--ramp-up-time', '10',
            '--max-memory', '512',
            '--max-cpu', '80',
            '--max-instances', '10'
          ]
        })
      ).rejects.toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError when ramp-up time >= test duration', async () => {
      await expect(
        ConfigurationManager.parseConfiguration({
          cliArgs: [
            '--streaming-url', 'https://example.com/stream',
            '--concurrent-users', '1',
            '--test-duration', '60',
            '--ramp-up-time', '60', // Invalid: must be < test duration
            '--max-memory', '512',
            '--max-cpu', '80',
            '--max-instances', '10'
          ]
        })
      ).rejects.toThrow(ConfigurationError);
    });
  });

  describe('combined configuration scenarios', () => {
    it('should handle complex configuration with all URL filtering options', async () => {
      const { config } = await ConfigurationManager.parseConfiguration({
        cliArgs: [
          '--streaming-url', 'https://example.com/stream',
          '--concurrent-users', '10',
          '--test-duration', '300',
          '--ramp-up-time', '30',
          '--max-memory', '1024',
          '--max-cpu', '90',
          '--max-instances', '20',
          '--streaming-only',
          '--allowed-urls', '*.css,*fonts*,/api/essential/',
          '--blocked-urls', '*analytics*,*tracking*,/ads/'
        ]
      });

      expect(config).toMatchObject({
        concurrentUsers: 10,
        testDuration: 300,
        rampUpTime: 30,
        streamingUrl: 'https://example.com/stream',
        streamingOnly: true,
        allowedUrls: ['*.css', '*fonts*', '/api/essential/'],
        blockedUrls: ['*analytics*', '*tracking*', '/ads/'],
        resourceLimits: {
          maxMemoryPerInstance: 1024,
          maxCpuPercentage: 90,
          maxConcurrentInstances: 20
        }
      });
    });

    it('should handle configuration with only streaming-only enabled', async () => {
      const { config } = await ConfigurationManager.parseConfiguration({
        cliArgs: [
          '--streaming-url', 'https://example.com/stream',
          '--concurrent-users', '5',
          '--test-duration', '120',
          '--ramp-up-time', '15',
          '--max-memory', '512',
          '--max-cpu', '80',
          '--max-instances', '10',
          '--streaming-only'
        ]
      });

      expect(config.streamingOnly).toBe(true);
      expect(config.allowedUrls).toEqual([]);
      expect(config.blockedUrls).toEqual([]);
    });

    it('should handle configuration with only URL filtering (no streaming-only)', async () => {
      const { config } = await ConfigurationManager.parseConfiguration({
        cliArgs: [
          '--streaming-url', 'https://example.com/stream',
          '--concurrent-users', '3',
          '--test-duration', '180',
          '--ramp-up-time', '20',
          '--max-memory', '512',
          '--max-cpu', '80',
          '--max-instances', '10',
          '--blocked-urls', '*analytics*,*tracking*'
        ]
      });

      expect(config.streamingOnly).toBe(false);
      expect(config.allowedUrls).toEqual([]);
      expect(config.blockedUrls).toEqual(['*analytics*', '*tracking*']);
    });
  });
});