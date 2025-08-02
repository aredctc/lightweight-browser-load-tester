/**
 * Configuration management system for the lightweight browser load tester
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Command } from 'commander';
import Joi from 'joi';
import YAML from 'yaml';
import { TestConfiguration } from '../types';

/**
 * Configuration source types
 */
export type ConfigSource = 'file' | 'cli' | 'env' | 'default';

/**
 * Configuration with metadata about sources
 */
export interface ConfigurationWithMeta {
  config: TestConfiguration;
  sources: Record<keyof TestConfiguration, ConfigSource>;
}

/**
 * Configuration file formats
 */
export type ConfigFormat = 'json' | 'yaml' | 'yml';

/**
 * Configuration parsing options
 */
export interface ConfigParseOptions {
  configFile?: string;
  cliArgs?: string[];
  validateOnly?: boolean;
}

/**
 * Configuration validation schema using Joi
 */
const drmConfigSchema = Joi.object({
  type: Joi.string().valid('widevine', 'playready', 'fairplay').required(),
  licenseUrl: Joi.string().uri().required(),
  certificateUrl: Joi.string().uri().optional(),
  customHeaders: Joi.object().pattern(Joi.string(), Joi.string()).optional()
});

const parameterTemplateSchema = Joi.object({
  target: Joi.string().valid('header', 'query', 'body').required(),
  name: Joi.string().required(),
  valueTemplate: Joi.string().required(),
  scope: Joi.string().valid('global', 'per-session').required()
});

const localStorageEntrySchema = Joi.object({
  domain: Joi.string().required(),
  data: Joi.object().pattern(Joi.string(), Joi.string()).required()
});

const resourceLimitsSchema = Joi.object({
  maxMemoryPerInstance: Joi.number().integer().min(128).required(),
  maxCpuPercentage: Joi.number().min(1).max(100).required(),
  maxConcurrentInstances: Joi.number().integer().min(1).required()
});

const prometheusConfigSchema = Joi.object({
  enabled: Joi.boolean().required(),
  remoteWriteUrl: Joi.string().uri().required(),
  username: Joi.string().optional(),
  password: Joi.string().optional(),
  headers: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
  batchSize: Joi.number().integer().min(1).default(100),
  flushInterval: Joi.number().integer().min(1).default(10),
  timeout: Joi.number().integer().min(1000).default(5000),
  retryAttempts: Joi.number().integer().min(0).default(3),
  retryDelay: Joi.number().integer().min(100).default(1000)
});

const opentelemetryConfigSchema = Joi.object({
  enabled: Joi.boolean().required(),
  endpoint: Joi.string().uri().required(),
  protocol: Joi.string().valid('http/protobuf', 'http/json', 'grpc').default('http/protobuf'),
  headers: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
  serviceName: Joi.string().default('lightweight-browser-load-tester'),
  serviceVersion: Joi.string().default('1.0.0'),
  timeout: Joi.number().integer().min(1000).default(5000),
  compression: Joi.string().valid('gzip', 'none').default('gzip'),
  batchTimeout: Joi.number().integer().min(1000).default(5000),
  maxExportBatchSize: Joi.number().integer().min(1).default(512),
  maxQueueSize: Joi.number().integer().min(1).default(2048),
  exportTimeout: Joi.number().integer().min(1000).default(30000)
});

const testConfigurationSchema = Joi.object({
  concurrentUsers: Joi.number().integer().min(1).required(),
  testDuration: Joi.number().integer().min(1).required(),
  rampUpTime: Joi.number().integer().min(0).required(),
  streamingUrl: Joi.string().uri().required(),
  streamingOnly: Joi.boolean().optional().default(false),
  allowedUrls: Joi.array().items(Joi.string()).optional().default([]),
  blockedUrls: Joi.array().items(Joi.string()).optional().default([]),
  drmConfig: drmConfigSchema.optional(),
  requestParameters: Joi.array().items(parameterTemplateSchema).default([]),
  resourceLimits: resourceLimitsSchema.required(),
  localStorage: Joi.array().items(localStorageEntrySchema).optional().default([]),
  prometheus: prometheusConfigSchema.optional(),
  opentelemetry: opentelemetryConfigSchema.optional()
});

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: TestConfiguration = {
  concurrentUsers: 1,
  testDuration: 60,
  rampUpTime: 10,
  streamingUrl: '',
  streamingOnly: false,
  allowedUrls: [],
  blockedUrls: [],
  requestParameters: [],
  localStorage: [],
  resourceLimits: {
    maxMemoryPerInstance: 512,
    maxCpuPercentage: 80,
    maxConcurrentInstances: 10
  }
};

/**
 * Environment variable mappings
 */
const ENV_MAPPINGS: Record<string, string> = {
  'LOAD_TEST_CONCURRENT_USERS': 'concurrentUsers',
  'LOAD_TEST_DURATION': 'testDuration',
  'LOAD_TEST_RAMP_UP': 'rampUpTime',
  'LOAD_TEST_STREAMING_URL': 'streamingUrl',
  'LOAD_TEST_STREAMING_ONLY': 'streamingOnly',
  'LOAD_TEST_ALLOWED_URLS': 'allowedUrls',
  'LOAD_TEST_BLOCKED_URLS': 'blockedUrls',
  'LOAD_TEST_MAX_MEMORY': 'resourceLimits.maxMemoryPerInstance',
  'LOAD_TEST_MAX_CPU': 'resourceLimits.maxCpuPercentage',
  'LOAD_TEST_MAX_INSTANCES': 'resourceLimits.maxConcurrentInstances',
  'LOAD_TEST_DRM_TYPE': 'drmConfig.type',
  'LOAD_TEST_DRM_LICENSE_URL': 'drmConfig.licenseUrl',
  'LOAD_TEST_DRM_CERT_URL': 'drmConfig.certificateUrl',
  'LOAD_TEST_PROMETHEUS_ENABLED': 'prometheus.enabled',
  'LOAD_TEST_PROMETHEUS_URL': 'prometheus.remoteWriteUrl',
  'LOAD_TEST_PROMETHEUS_USERNAME': 'prometheus.username',
  'LOAD_TEST_PROMETHEUS_PASSWORD': 'prometheus.password',
  'LOAD_TEST_PROMETHEUS_BATCH_SIZE': 'prometheus.batchSize',
  'LOAD_TEST_PROMETHEUS_FLUSH_INTERVAL': 'prometheus.flushInterval',
  'LOAD_TEST_PROMETHEUS_TIMEOUT': 'prometheus.timeout',
  'LOAD_TEST_PROMETHEUS_RETRY_ATTEMPTS': 'prometheus.retryAttempts',
  'LOAD_TEST_PROMETHEUS_RETRY_DELAY': 'prometheus.retryDelay',
  'LOAD_TEST_OTEL_ENABLED': 'opentelemetry.enabled',
  'LOAD_TEST_OTEL_ENDPOINT': 'opentelemetry.endpoint',
  'LOAD_TEST_OTEL_PROTOCOL': 'opentelemetry.protocol',
  'LOAD_TEST_OTEL_SERVICE_NAME': 'opentelemetry.serviceName',
  'LOAD_TEST_OTEL_SERVICE_VERSION': 'opentelemetry.serviceVersion',
  'LOAD_TEST_OTEL_TIMEOUT': 'opentelemetry.timeout',
  'LOAD_TEST_OTEL_COMPRESSION': 'opentelemetry.compression',
  'LOAD_TEST_OTEL_BATCH_TIMEOUT': 'opentelemetry.batchTimeout',
  'LOAD_TEST_OTEL_MAX_EXPORT_BATCH_SIZE': 'opentelemetry.maxExportBatchSize',
  'LOAD_TEST_OTEL_MAX_QUEUE_SIZE': 'opentelemetry.maxQueueSize',
  'LOAD_TEST_OTEL_EXPORT_TIMEOUT': 'opentelemetry.exportTimeout'
};

/**
 * Configuration parsing and validation errors
 */
export class ConfigurationError extends Error {
  constructor(message: string, public source?: ConfigSource, public field?: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Main configuration manager class
 */
export class ConfigurationManager {
  /**
   * Parse configuration from multiple sources with priority order:
   * 1. Command line arguments (highest priority)
   * 2. Environment variables
   * 3. Configuration file
   * 4. Default values (lowest priority)
   */
  static async parseConfiguration(options: ConfigParseOptions = {}): Promise<ConfigurationWithMeta> {
    const sources: Record<string, ConfigSource> = {};
    let config = { ...DEFAULT_CONFIG };
    
    // Set default sources
    Object.keys(config).forEach(key => {
      sources[key] = 'default';
    });

    try {
      // 1. Load from configuration file if provided
      if (options.configFile) {
        const fileConfig = this.loadConfigFile(options.configFile);
        config = this.mergeConfigs(config, fileConfig, sources, 'file');
      }

      // 2. Load from environment variables
      const envConfig = this.loadFromEnvironment();
      config = this.mergeConfigs(config, envConfig, sources, 'env');

      // 3. Load from command line arguments
      if (options.cliArgs) {
        const cliConfig = this.parseCommandLineArgs(options.cliArgs);
        config = this.mergeConfigs(config, cliConfig, sources, 'cli');
      }

      // 4. Validate final configuration (unless validateOnly is true)
      if (!options.validateOnly) {
        this.validateConfiguration(config);
      }

      return {
        config,
        sources: sources as Record<keyof TestConfiguration, ConfigSource>
      };

    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new ConfigurationError(`Configuration parsing failed: ${message}`);
    }
  }

  /**
   * Load configuration from file (JSON or YAML)
   */
  private static loadConfigFile(filePath: string): Partial<TestConfiguration> {
    try {
      const absolutePath = resolve(filePath);
      const fileContent = readFileSync(absolutePath, 'utf8');
      const format = this.detectFileFormat(filePath);

      let parsed: any;
      switch (format) {
        case 'json':
          parsed = JSON.parse(fileContent);
          break;
        case 'yaml':
        case 'yml':
          parsed = YAML.parse(fileContent);
          break;
        default:
          throw new ConfigurationError(`Unsupported file format: ${format}`, 'file');
      }

      return parsed;
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new ConfigurationError(`Failed to load config file: ${message}`, 'file');
    }
  }

  /**
   * Detect configuration file format from extension
   */
  private static detectFileFormat(filePath: string): ConfigFormat {
    const extension = filePath.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'json':
        return 'json';
      case 'yaml':
      case 'yml':
        return 'yaml';
      default:
        throw new ConfigurationError(`Unknown file extension: ${extension}`, 'file');
    }
  }

  /**
   * Load configuration from environment variables
   */
  private static loadFromEnvironment(): Partial<TestConfiguration> {
    const config: any = {};

    Object.entries(ENV_MAPPINGS).forEach(([envVar, configPath]) => {
      const value = process.env[envVar];
      if (value !== undefined) {
        this.setNestedValue(config, configPath, this.parseEnvValue(value));
      }
    });

    return config;
  }

  /**
   * Parse command line arguments using Commander.js
   */
  private static parseCommandLineArgs(args: string[]): Partial<TestConfiguration> {
    const program = new Command();
    
    program
      .option('-u, --concurrent-users <number>', 'Number of concurrent users', parseInt)
      .option('-d, --test-duration <seconds>', 'Test duration in seconds', parseInt)
      .option('-r, --ramp-up-time <seconds>', 'Ramp up time in seconds', parseInt)
      .option('-s, --streaming-url <url>', 'Streaming URL to test')
      .option('--max-memory <mb>', 'Maximum memory per instance in MB', parseInt)
      .option('--max-cpu <percentage>', 'Maximum CPU percentage', parseInt)
      .option('--max-instances <number>', 'Maximum concurrent instances', parseInt)
      .option('--drm-type <type>', 'DRM type (widevine|playready|fairplay)')
      .option('--drm-license-url <url>', 'DRM license URL')
      .option('--drm-cert-url <url>', 'DRM certificate URL')
      .option('--prometheus-enabled', 'Enable Prometheus metrics export')
      .option('--prometheus-url <url>', 'Prometheus RemoteWrite endpoint URL')
      .option('--prometheus-username <username>', 'Prometheus authentication username')
      .option('--prometheus-password <password>', 'Prometheus authentication password')
      .option('--prometheus-batch-size <number>', 'Prometheus metrics batch size', parseInt)
      .option('--prometheus-flush-interval <seconds>', 'Prometheus flush interval in seconds', parseInt)
      .option('--otel-enabled', 'Enable OpenTelemetry metrics export')
      .option('--otel-endpoint <url>', 'OpenTelemetry OTLP endpoint URL')
      .option('--otel-protocol <protocol>', 'OpenTelemetry protocol (http/protobuf|http/json|grpc)')
      .option('--otel-service-name <name>', 'OpenTelemetry service name')
      .option('--otel-service-version <version>', 'OpenTelemetry service version')
      .option('--otel-timeout <ms>', 'OpenTelemetry request timeout in milliseconds', parseInt)
      .option('--otel-compression <type>', 'OpenTelemetry compression (gzip|none)')
      .option('--otel-batch-timeout <ms>', 'OpenTelemetry batch timeout in milliseconds', parseInt)
      .option('--streaming-only', 'Block all non-streaming requests to save CPU/memory')
      .option('--allowed-urls <patterns>', 'Comma-separated URL patterns to always allow (even when streaming-only is enabled)')
      .option('--blocked-urls <patterns>', 'Comma-separated URL patterns to always block (even if streaming-related)');

    program.parse(args, { from: 'user' });
    const options = program.opts();

    const config: any = {};

    if (options.concurrentUsers !== undefined) config.concurrentUsers = options.concurrentUsers;
    if (options.testDuration !== undefined) config.testDuration = options.testDuration;
    if (options.rampUpTime !== undefined) config.rampUpTime = options.rampUpTime;
    if (options.streamingUrl !== undefined) config.streamingUrl = options.streamingUrl;

    if (options.maxMemory !== undefined || options.maxCpu !== undefined || options.maxInstances !== undefined) {
      config.resourceLimits = {};
      if (options.maxMemory !== undefined) config.resourceLimits.maxMemoryPerInstance = options.maxMemory;
      if (options.maxCpu !== undefined) config.resourceLimits.maxCpuPercentage = options.maxCpu;
      if (options.maxInstances !== undefined) config.resourceLimits.maxConcurrentInstances = options.maxInstances;
    }

    if (options.drmType !== undefined || options.drmLicenseUrl !== undefined || options.drmCertUrl !== undefined) {
      config.drmConfig = {};
      if (options.drmType !== undefined) config.drmConfig.type = options.drmType;
      if (options.drmLicenseUrl !== undefined) config.drmConfig.licenseUrl = options.drmLicenseUrl;
      if (options.drmCertUrl !== undefined) config.drmConfig.certificateUrl = options.drmCertUrl;
    }

    if (options.prometheusEnabled !== undefined || options.prometheusUrl !== undefined || 
        options.prometheusUsername !== undefined || options.prometheusPassword !== undefined ||
        options.prometheusBatchSize !== undefined || options.prometheusFlushInterval !== undefined) {
      config.prometheus = {};
      if (options.prometheusEnabled !== undefined) config.prometheus.enabled = options.prometheusEnabled;
      if (options.prometheusUrl !== undefined) config.prometheus.remoteWriteUrl = options.prometheusUrl;
      if (options.prometheusUsername !== undefined) config.prometheus.username = options.prometheusUsername;
      if (options.prometheusPassword !== undefined) config.prometheus.password = options.prometheusPassword;
      if (options.prometheusBatchSize !== undefined) config.prometheus.batchSize = options.prometheusBatchSize;
      if (options.prometheusFlushInterval !== undefined) config.prometheus.flushInterval = options.prometheusFlushInterval;
    }

    if (options.otelEnabled !== undefined || options.otelEndpoint !== undefined || 
        options.otelProtocol !== undefined || options.otelServiceName !== undefined ||
        options.otelServiceVersion !== undefined || options.otelTimeout !== undefined ||
        options.otelCompression !== undefined || options.otelBatchTimeout !== undefined) {
      config.opentelemetry = {};
      if (options.otelEnabled !== undefined) config.opentelemetry.enabled = options.otelEnabled;
      if (options.otelEndpoint !== undefined) config.opentelemetry.endpoint = options.otelEndpoint;
      if (options.otelProtocol !== undefined) config.opentelemetry.protocol = options.otelProtocol;
      if (options.otelServiceName !== undefined) config.opentelemetry.serviceName = options.otelServiceName;
      if (options.otelServiceVersion !== undefined) config.opentelemetry.serviceVersion = options.otelServiceVersion;
      if (options.otelTimeout !== undefined) config.opentelemetry.timeout = options.otelTimeout;
      if (options.otelCompression !== undefined) config.opentelemetry.compression = options.otelCompression;
      if (options.otelBatchTimeout !== undefined) config.opentelemetry.batchTimeout = options.otelBatchTimeout;
    }

    if (options.streamingOnly !== undefined) config.streamingOnly = options.streamingOnly;

    // Parse URL patterns (comma-separated strings to arrays)
    if (options.allowedUrls !== undefined) {
      config.allowedUrls = options.allowedUrls.split(',').map((url: string) => url.trim()).filter((url: string) => url.length > 0);
    }
    if (options.blockedUrls !== undefined) {
      config.blockedUrls = options.blockedUrls.split(',').map((url: string) => url.trim()).filter((url: string) => url.length > 0);
    }

    return config;
  }

  /**
   * Merge configurations with source tracking
   */
  private static mergeConfigs(
    base: any,
    override: any,
    sources: Record<string, ConfigSource>,
    source: ConfigSource
  ): any {
    const result = { ...base };

    Object.keys(override).forEach(key => {
      if (override[key] !== undefined) {
        if (typeof override[key] === 'object' && override[key] !== null && !Array.isArray(override[key])) {
          result[key] = this.mergeConfigs(result[key] || {}, override[key], sources, source);
        } else {
          result[key] = override[key];
          sources[key] = source;
        }
      }
    });

    return result;
  }

  /**
   * Set nested object value using dot notation
   */
  private static setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * Parse environment variable value to appropriate type
   */
  private static parseEnvValue(value: string): any {
    // Try to parse as number
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    
    // Try to parse as float
    if (/^\d+\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    // Try to parse as boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Try to parse as comma-separated array
    if (value.includes(',')) {
      return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
    }

    // Return as string
    return value;
  }

  /**
   * Validate configuration using Joi schema
   */
  private static validateConfiguration(config: TestConfiguration): void {
    const { error } = testConfigurationSchema.validate(config, { 
      abortEarly: false,
      allowUnknown: false 
    });

    if (error) {
      const details = error.details.map(detail => `${detail.path.join('.')}: ${detail.message}`).join('; ');
      throw new ConfigurationError(`Configuration validation failed: ${details}`);
    }

    // Additional custom validations
    if (config.rampUpTime >= config.testDuration) {
      throw new ConfigurationError('Ramp up time must be less than test duration');
    }

    if (!config.streamingUrl) {
      throw new ConfigurationError('Streaming URL is required');
    }
  }

  /**
   * Get configuration schema for external validation
   */
  static getValidationSchema(): Joi.ObjectSchema {
    return testConfigurationSchema;
  }

  /**
   * Create example configuration file
   */
  static generateExampleConfig(format: ConfigFormat = 'yaml'): string {
    const exampleConfig: TestConfiguration = {
      concurrentUsers: 5,
      testDuration: 300,
      rampUpTime: 30,
      streamingUrl: 'https://example.com/stream',
      streamingOnly: false,
      allowedUrls: ['*manifest*', '*playlist*'],
      blockedUrls: ['*analytics*', '*tracking*'],
      drmConfig: {
        type: 'widevine',
        licenseUrl: 'https://example.com/license',
        certificateUrl: 'https://example.com/cert'
      },
      requestParameters: [
        {
          target: 'header',
          name: 'Authorization',
          valueTemplate: 'Bearer {{token}}',
          scope: 'per-session'
        }
      ],
      localStorage: [
        {
          domain: 'example.com',
          data: {
            'auth_token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            'user_id': '12345',
            'session_id': 'sess_abc123'
          }
        },
        {
          domain: 'cdn.example.com',
          data: {
            'preferences': '{"theme":"dark","language":"en"}',
            'cache_version': '1.2.3'
          }
        }
      ],
      resourceLimits: {
        maxMemoryPerInstance: 512,
        maxCpuPercentage: 80,
        maxConcurrentInstances: 10
      },
      prometheus: {
        enabled: false,
        remoteWriteUrl: 'https://prometheus.example.com/api/v1/write',
        username: 'prometheus_user',
        password: 'prometheus_password',
        batchSize: 100,
        flushInterval: 10,
        timeout: 5000,
        retryAttempts: 3,
        retryDelay: 1000
      },
      opentelemetry: {
        enabled: false,
        endpoint: 'https://otel-collector.example.com:4318/v1/metrics',
        protocol: 'http/protobuf',
        serviceName: 'lightweight-browser-load-tester',
        serviceVersion: '1.0.0',
        timeout: 5000,
        compression: 'gzip',
        batchTimeout: 5000,
        maxExportBatchSize: 512,
        maxQueueSize: 2048,
        exportTimeout: 30000
      }
    };

    switch (format) {
      case 'json':
        return JSON.stringify(exampleConfig, null, 2);
      case 'yaml':
      case 'yml':
        return YAML.stringify(exampleConfig);
      default:
        throw new ConfigurationError(`Unsupported format: ${format}`);
    }
  }
}