import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      // Exclude integration and performance tests in CI
      'src/integration.test.ts',
      'src/performance.test.ts'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.config.ts',
        // Exclude integration and performance test files from coverage
        'src/integration.test.ts',
        'src/performance.test.ts'
      ],
    },
    // Faster execution for CI
    testTimeout: 30000, // 30 seconds instead of default
    hookTimeout: 10000, // 10 seconds for setup/teardown
  },
});