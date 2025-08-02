import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RandomizationUtil } from './randomization';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('RandomizationUtil', () => {
  let randomizationUtil: RandomizationUtil;
  let testDataDir: string;

  beforeEach(() => {
    // Create test data directory
    testDataDir = join(process.cwd(), 'test-randomization-util');
    try {
      mkdirSync(testDataDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Initialize with test context
    randomizationUtil = new RandomizationUtil({
      sessionId: 'test-session-123',
      timestamp: 1640995200000,
      testArray: ['value1', 'value2', 'value3'],
      userIds: ['user_001', 'user_002', 'user_003']
    });
  });

  afterEach(() => {
    // Clean up test data directory
    try {
      rmSync(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist
    }
  });

  describe('basic variable substitution', () => {
    it('should substitute simple variables', () => {
      const result = randomizationUtil.substituteVariables('Hello {{sessionId}}');
      expect(result).toBe('Hello test-session-123');
    });

    it('should substitute multiple variables', () => {
      const result = randomizationUtil.substituteVariables('{{sessionId}}-{{timestamp}}');
      expect(result).toBe('test-session-123-1640995200000');
    });

    it('should leave unknown variables unchanged', () => {
      const result = randomizationUtil.substituteVariables('{{unknownVar}}');
      expect(result).toBe('{{unknownVar}}');
    });
  });

  describe('random functions', () => {
    it('should generate UUID', () => {
      const result = randomizationUtil.substituteVariables('{{random:uuid}}');
      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should generate random number', () => {
      const result = randomizationUtil.substituteVariables('{{random:number}}');
      expect(result).toMatch(/^\d+$/);
      expect(parseInt(result)).toBeGreaterThanOrEqual(0);
      expect(parseInt(result)).toBeLessThan(1000000);
    });

    it('should generate timestamp', () => {
      const result = randomizationUtil.substituteVariables('{{random:timestamp}}');
      expect(result).toMatch(/^\d+$/);
      expect(parseInt(result)).toBeGreaterThan(1640000000000); // After 2021
    });

    it('should generate hex string', () => {
      const result = randomizationUtil.substituteVariables('{{random:hex}}');
      expect(result).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate alphanumeric string', () => {
      const result = randomizationUtil.substituteVariables('{{random:alphanumeric}}');
      expect(result).toMatch(/^[A-Za-z0-9]{8}$/);
    });

    it('should generate random number in range', () => {
      const result = randomizationUtil.substituteVariables('{{random:1-10}}');
      const num = parseInt(result);
      expect(num).toBeGreaterThanOrEqual(1);
      expect(num).toBeLessThanOrEqual(10);
    });

    it('should handle unknown random function', () => {
      const result = randomizationUtil.substituteVariables('{{random:unknown}}');
      expect(result).toBe('random:unknown');
    });
  });

  describe('randomFrom functions', () => {
    it('should select from array', () => {
      const result = randomizationUtil.substituteVariables('{{randomFrom:testArray}}');
      expect(['value1', 'value2', 'value3']).toContain(result);
    });

    it('should handle non-array variable', () => {
      const result = randomizationUtil.substituteVariables('{{randomFrom:sessionId}}');
      expect(result).toBe('randomFrom:sessionId');
    });

    it('should handle unknown array', () => {
      const result = randomizationUtil.substituteVariables('{{randomFrom:unknownArray}}');
      expect(result).toBe('randomFrom:unknownArray');
    });
  });

  describe('randomFromFile functions', () => {
    it('should select from file', () => {
      const testFile = join(testDataDir, 'test-values.txt');
      writeFileSync(testFile, 'line1\nline2\nline3\n');

      const result = randomizationUtil.substituteVariables(`{{randomFromFile:${testFile}}}`);
      expect(['line1', 'line2', 'line3']).toContain(result);
    });

    it('should handle file with comments and empty lines', () => {
      const testFile = join(testDataDir, 'test-comments.txt');
      writeFileSync(testFile, '# This is a comment\nvalue1\n\nvalue2\n# Another comment\nvalue3\n');

      const result = randomizationUtil.substituteVariables(`{{randomFromFile:${testFile}}}`);
      expect(['value1', 'value2', 'value3']).toContain(result);
    });

    it('should handle non-existent file', () => {
      const result = randomizationUtil.substituteVariables('{{randomFromFile:non-existent.txt}}');
      expect(result).toBe('randomFromFile:non-existent.txt');
    });

    it('should cache file data', () => {
      const testFile = join(testDataDir, 'test-cache.txt');
      writeFileSync(testFile, 'cached1\ncached2\n');

      // First call should read from file
      const result1 = randomizationUtil.substituteVariables(`{{randomFromFile:${testFile}}}`);
      expect(['cached1', 'cached2']).toContain(result1);

      // Second call should use cache
      const result2 = randomizationUtil.substituteVariables(`{{randomFromFile:${testFile}}}`);
      expect(['cached1', 'cached2']).toContain(result2);
    });
  });

  describe('context updates', () => {
    it('should update context', () => {
      randomizationUtil.updateContext({ newVar: 'newValue' });
      const result = randomizationUtil.substituteVariables('{{newVar}}');
      expect(result).toBe('newValue');
    });

    it('should merge context', () => {
      randomizationUtil.updateContext({ newVar: 'newValue' });
      const result1 = randomizationUtil.substituteVariables('{{sessionId}}');
      const result2 = randomizationUtil.substituteVariables('{{newVar}}');
      expect(result1).toBe('test-session-123');
      expect(result2).toBe('newValue');
    });
  });

  describe('processLocalStorageData', () => {
    it('should process all values in localStorage data', () => {
      const data = {
        'auth_token': 'token-{{random:uuid}}',
        'user_id': '{{randomFrom:userIds}}',
        'session_id': '{{sessionId}}',
        'timestamp': '{{random:timestamp}}',
        'static_value': 'no_substitution'
      };

      const result = randomizationUtil.processLocalStorageData(data);

      expect(result.auth_token).toMatch(/^token-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(['user_001', 'user_002', 'user_003']).toContain(result.user_id);
      expect(result.session_id).toBe('test-session-123');
      expect(result.timestamp).toMatch(/^\d+$/);
      expect(result.static_value).toBe('no_substitution');
    });

    it('should handle empty data', () => {
      const result = randomizationUtil.processLocalStorageData({});
      expect(result).toEqual({});
    });

    it('should handle complex JSON strings', () => {
      const data = {
        'user_preferences': '{"theme":"{{randomFrom:themes}}","userId":"{{randomFrom:userIds}}"}',
        'cart_items': '[{"id":"{{random:uuid}}","quantity":{{random:1-5}}}]'
      };

      randomizationUtil.updateContext({
        themes: ['light', 'dark', 'auto']
      });

      const result = randomizationUtil.processLocalStorageData(data);

      // Parse the JSON to verify structure is maintained
      const preferences = JSON.parse(result.user_preferences);
      expect(['light', 'dark', 'auto']).toContain(preferences.theme);
      expect(['user_001', 'user_002', 'user_003']).toContain(preferences.userId);

      const cartItems = JSON.parse(result.cart_items);
      expect(cartItems[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(cartItems[0].quantity).toBeGreaterThanOrEqual(1);
      expect(cartItems[0].quantity).toBeLessThanOrEqual(5);
    });
  });

  describe('complex scenarios', () => {
    it('should handle multiple substitutions in single value', () => {
      const result = randomizationUtil.substituteVariables('{{sessionId}}-{{random:number}}-{{randomFrom:userIds}}');
      expect(result).toMatch(/^test-session-123-\d+-user_00[123]$/);
    });

    it('should handle nested substitutions', () => {
      const data = {
        'complex_data': '{"session":"{{sessionId}}","user":{"id":"{{randomFrom:userIds}}","token":"{{random:uuid}}"}}',
        'simple_id': '{{random:alphanumeric}}'
      };

      const result = randomizationUtil.processLocalStorageData(data);
      
      const complexData = JSON.parse(result.complex_data);
      expect(complexData.session).toBe('test-session-123');
      expect(['user_001', 'user_002', 'user_003']).toContain(complexData.user.id);
      expect(complexData.user.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(result.simple_id).toMatch(/^[A-Za-z0-9]{8}$/);
    });
  });
});