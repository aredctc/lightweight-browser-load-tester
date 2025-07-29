#!/usr/bin/env node

/**
 * Main entry point for the lightweight browser load tester
 */

import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { TestConfiguration, TestResults } from './types';
import { ConfigurationManager, ConfigurationError } from './config';
import { TestRunner } from './controllers/test-runner';
import { ResultsAggregator } from './aggregators/results-aggregator';
import { PrometheusExporter } from './exporters/prometheus-exporter';
import { OpenTelemetryExporter } from './exporters/opentelemetry-exporter';

/**
 * Main application class that coordinates all components
 */
export class LoadTesterApp {
  private config: TestConfiguration;
  private testRunner?: TestRunner;
  private resultsAggregator?: ResultsAggregator;
  private prometheusExporter?: PrometheusExporter;
  private opentelemetryExporter?: OpenTelemetryExporter;
  private isShuttingDown = false;
  private shutdownPromise?: Promise<TestResults | null>;

  constructor(config: TestConfiguration) {
    this.config = config;
    this.setupGracefulShutdown();
  }

  /**
   * Start the load test application
   */
  async start(): Promise<TestResults> {
    if (this.isShuttingDown) {
      throw new Error('Application is shutting down');
    }

    console.log('🚀 Starting lightweight browser load tester...');
    console.log(`📊 Configuration: ${this.config.concurrentUsers} users, ${this.config.testDuration}s duration`);
    console.log(`🎯 Target URL: ${this.config.streamingUrl}`);
    
    if (this.config.drmConfig) {
      console.log(`🔐 DRM: ${this.config.drmConfig.type} (${this.config.drmConfig.licenseUrl})`);
    }

    try {
      // Initialize components
      this.testRunner = new TestRunner(this.config);
      this.resultsAggregator = new ResultsAggregator();
      
      if (this.config.prometheus?.enabled) {
        this.prometheusExporter = new PrometheusExporter(this.config.prometheus);
        console.log('📈 Prometheus metrics export enabled');
      }

      if (this.config.opentelemetry?.enabled) {
        this.opentelemetryExporter = new OpenTelemetryExporter(this.config.opentelemetry);
        await this.opentelemetryExporter.initialize();
        console.log('📊 OpenTelemetry metrics export enabled');
      }

      // Set up event handlers
      this.setupTestRunnerEvents();

      // Start the test
      await this.testRunner.startTest();

      // Wait for test completion or shutdown
      return await this.waitForCompletion();

    } catch (error) {
      console.error('❌ Failed to start load test:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Stop the application gracefully
   */
  async stop(): Promise<TestResults | null> {
    if (this.isShuttingDown) {
      if (this.shutdownPromise) {
        await this.shutdownPromise;
      }
      return null;
    }

    console.log('\n🛑 Graceful shutdown initiated...');
    this.isShuttingDown = true;

    this.shutdownPromise = this.performShutdown();
    return await this.shutdownPromise;
  }

  /**
   * Get current test status
   */
  getStatus() {
    if (!this.testRunner) {
      return { status: 'not_started' };
    }

    return {
      status: this.testRunner.isTestRunning() ? 'running' : 'completed',
      testId: this.testRunner.getTestId(),
      monitoring: this.testRunner.getMonitoringData()
    };
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdownHandler = async (signal: string) => {
      console.log(`\n📡 Received ${signal}, initiating graceful shutdown...`);
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('💥 Uncaught exception:', error);
      await this.stop();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
      await this.stop();
      process.exit(1);
    });
  }

  /**
   * Set up test runner event handlers
   */
  private setupTestRunnerEvents(): void {
    if (!this.testRunner) return;

    this.testRunner.on('test-started', ({ testId }) => {
      console.log(`✅ Test started (ID: ${testId})`);
    });

    this.testRunner.on('ramp-up-completed', () => {
      console.log('📈 Ramp-up phase completed, all users active');
    });

    this.testRunner.on('monitoring-update', ({ data }) => {
      const progress = this.config.testDuration > 0 
        ? ((data.elapsedTime / this.config.testDuration) * 100).toFixed(1)
        : '0.0';
      
      process.stdout.write(
        `\r⏱️  Progress: ${progress}% | ` +
        `👥 Active: ${data.activeSessions} | ` +
        `📊 Requests: ${data.totalRequests} (${data.successfulRequests} success, ${data.failedRequests} failed) | ` +
        `⚡ RPS: ${data.currentRps.toFixed(1)} | ` +
        `💾 Memory: ${data.memoryUsage.toFixed(0)}MB | ` +
        `⏰ Remaining: ${Math.max(0, data.remainingTime).toFixed(0)}s`
      );

      // Export metrics to Prometheus if enabled
      if (this.prometheusExporter) {
        // Export test summary metrics
        this.prometheusExporter.exportTestSummary({
          totalRequests: data.totalRequests,
          successfulRequests: data.successfulRequests,
          failedRequests: data.failedRequests,
          averageResponseTime: data.averageResponseTime,
          peakConcurrentUsers: data.activeSessions,
          testDuration: data.elapsedTime
        });
      }

      // Export metrics to OpenTelemetry if enabled
      if (this.opentelemetryExporter) {
        // Export test summary metrics
        this.opentelemetryExporter.exportTestSummary({
          totalRequests: data.totalRequests,
          successfulRequests: data.successfulRequests,
          failedRequests: data.failedRequests,
          averageResponseTime: data.averageResponseTime,
          peakConcurrentUsers: data.activeSessions,
          testDuration: data.elapsedTime
        });
      }
    });

    this.testRunner.on('test-completed', ({ results }) => {
      console.log('\n✅ Test completed successfully');
      this.displayResults(results);
    });

    this.testRunner.on('test-failed', ({ error }) => {
      console.log('\n❌ Test failed:', error.message);
    });

    this.testRunner.on('session-failed', ({ sessionId, error }) => {
      console.log(`\n⚠️  Session ${sessionId} failed: ${error.message}`);
    });
  }

  /**
   * Wait for test completion
   */
  private async waitForCompletion(): Promise<TestResults> {
    return new Promise((resolve, reject) => {
      if (!this.testRunner) {
        reject(new Error('Test runner not initialized'));
        return;
      }

      this.testRunner.once('test-completed', ({ results }) => {
        resolve(results);
      });

      this.testRunner.once('test-failed', ({ error }) => {
        reject(error);
      });
    });
  }

  /**
   * Perform shutdown cleanup
   */
  private async performShutdown(): Promise<TestResults | null> {
    let results: TestResults | null = null;

    try {
      // Stop test runner if running
      if (this.testRunner && this.testRunner.isTestRunning()) {
        console.log('🔄 Stopping test runner...');
        results = await this.testRunner.stopTest();
        console.log('✅ Test runner stopped');
      }

      // Cleanup components
      await this.cleanup();

      if (results) {
        console.log('\n📊 Final Results:');
        this.displayResults(results);
      }

      console.log('✅ Graceful shutdown completed');
      return results;

    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    const cleanupPromises: Promise<void>[] = [];

    if (this.prometheusExporter) {
      cleanupPromises.push(this.prometheusExporter.shutdown());
    }

    if (this.opentelemetryExporter) {
      cleanupPromises.push(this.opentelemetryExporter.shutdown());
    }

    await Promise.all(cleanupPromises);
  }

  /**
   * Display test results summary
   */
  private displayResults(results: TestResults): void {
    console.log('\n📊 Test Results Summary:');
    console.log('═'.repeat(50));
    console.log(`📈 Total Requests: ${results.summary.totalRequests}`);
    console.log(`✅ Successful: ${results.summary.successfulRequests} (${((results.summary.successfulRequests / results.summary.totalRequests) * 100).toFixed(1)}%)`);
    console.log(`❌ Failed: ${results.summary.failedRequests} (${((results.summary.failedRequests / results.summary.totalRequests) * 100).toFixed(1)}%)`);
    console.log(`⏱️  Average Response Time: ${results.summary.averageResponseTime.toFixed(2)}ms`);
    console.log(`👥 Peak Concurrent Users: ${results.summary.peakConcurrentUsers}`);
    console.log(`⏰ Test Duration: ${results.summary.testDuration.toFixed(1)}s`);

    if (results.drmMetrics.length > 0) {
      console.log('\n🔐 DRM Metrics:');
      results.drmMetrics.forEach(drm => {
        console.log(`  ${drm.drmType}: ${drm.licenseRequestCount} requests, ${drm.averageLicenseTime.toFixed(2)}ms avg, ${drm.licenseSuccessRate.toFixed(1)}% success`);
      });
    }

    if (results.errors.length > 0) {
      console.log(`\n⚠️  Errors: ${results.errors.length} total`);
      const errorCounts = results.errors.reduce((acc, error) => {
        acc[error.level] = (acc[error.level] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      Object.entries(errorCounts).forEach(([level, count]) => {
        console.log(`  ${level}: ${count}`);
      });
    }
  }
}

/**
 * CLI command definitions and main entry point
 */
async function main(): Promise<void> {
  const program = new Command();
  
  // Read package.json for version
  const packagePath = resolve(__dirname, '../package.json');
  const packageInfo = existsSync(packagePath) 
    ? JSON.parse(readFileSync(packagePath, 'utf8'))
    : { version: '1.0.0', description: 'Lightweight browser load tester' };

  program
    .name('load-tester')
    .description(packageInfo.description)
    .version(packageInfo.version);

  // Main test command
  program
    .command('test')
    .description('Run a load test')
    .option('-c, --config <file>', 'Configuration file (JSON or YAML)')
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
    .option('--otel-enabled', 'Enable OpenTelemetry metrics export')
    .option('--otel-endpoint <url>', 'OpenTelemetry OTLP endpoint URL')
    .option('--otel-protocol <protocol>', 'OpenTelemetry protocol (http/protobuf|http/json|grpc)')
    .option('--otel-service-name <name>', 'OpenTelemetry service name')
    .option('--otel-service-version <version>', 'OpenTelemetry service version')
    .option('--output <file>', 'Output file for results (JSON format)')
    .option('--verbose', 'Enable verbose logging')
    .action(async (options) => {
      try {
        // Parse configuration
        const { config } = await ConfigurationManager.parseConfiguration({
          configFile: options.config,
          cliArgs: process.argv
        });

        // Validate required fields
        if (!config.streamingUrl) {
          console.error('❌ Error: Streaming URL is required. Use --streaming-url or set it in config file.');
          process.exit(1);
        }

        // Create and start application
        const app = new LoadTesterApp(config);
        const results = await app.start();

        // Save results to file if specified
        if (options.output) {
          const fs = await import('fs/promises');
          await fs.writeFile(options.output, JSON.stringify(results, null, 2));
          console.log(`📄 Results saved to ${options.output}`);
        }

        process.exit(0);

      } catch (error) {
        if (error instanceof ConfigurationError) {
          console.error('❌ Configuration Error:', error.message);
          if (error.source) {
            console.error(`   Source: ${error.source}`);
          }
        } else {
          console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        }
        process.exit(1);
      }
    });

  // Configuration validation command
  program
    .command('validate')
    .description('Validate configuration file')
    .option('-c, --config <file>', 'Configuration file to validate')
    .action(async (options) => {
      try {
        if (!options.config) {
          console.error('❌ Error: Configuration file is required for validation');
          process.exit(1);
        }

        await ConfigurationManager.parseConfiguration({
          configFile: options.config,
          validateOnly: true
        });

        console.log('✅ Configuration is valid');
        process.exit(0);

      } catch (error) {
        if (error instanceof ConfigurationError) {
          console.error('❌ Configuration Error:', error.message);
        } else {
          console.error('❌ Validation Error:', error instanceof Error ? error.message : String(error));
        }
        process.exit(1);
      }
    });

  // Generate example configuration command
  program
    .command('init')
    .description('Generate example configuration file')
    .option('-f, --format <format>', 'Output format (json|yaml)', 'yaml')
    .option('-o, --output <file>', 'Output file name', 'load-test-config.yaml')
    .action(async (options) => {
      try {
        const format = options.format as 'json' | 'yaml';
        const content = ConfigurationManager.generateExampleConfig(format);
        
        const fs = await import('fs/promises');
        await fs.writeFile(options.output, content);
        
        console.log(`✅ Example configuration created: ${options.output}`);
        console.log('📝 Edit the file to match your testing requirements');
        process.exit(0);

      } catch (error) {
        console.error('❌ Error creating configuration:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Parse command line arguments
  await program.parseAsync(process.argv);
}

// Run CLI if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

// Export all types and classes for external use
export * from './types';
export * from './config';
export * from './controllers/test-runner';
export * from './aggregators/results-aggregator';
export * from './exporters/prometheus-exporter';
export * from './exporters/opentelemetry-exporter';