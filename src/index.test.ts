/**
 * Basic tests for the main application entry point
 */

import { describe, it, expect } from 'vitest';

describe('Application', () => {
  it('should have basic functionality', () => {
    // Basic test to ensure the test runner works
    expect(true).toBe(true);
  });

  it('should export main classes', async () => {
    // Test that main exports are available
    const { LoadTesterApp } = await import('./index');
    expect(LoadTesterApp).toBeDefined();
    expect(typeof LoadTesterApp).toBe('function');
  });
});

describe('Package Configuration', () => {
  it('should have valid package.json', async () => {
    const packageJson = await import('../package.json');
    expect(packageJson.name).toBe('lightweight-browser-load-tester');
    expect(packageJson.version).toBeDefined();
    expect(packageJson.description).toBeDefined();
  });
});