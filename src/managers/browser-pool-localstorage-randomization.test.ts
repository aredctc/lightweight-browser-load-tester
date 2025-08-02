import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { BrowserPool } from './browser-pool';
import { BrowserPoolConfig, LocalStorageEntry } from '../types';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

// Mock Playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn()
  }
}));

describe('BrowserPool localStorage randomization', () => {
  let browserPool: BrowserPool;
  let mockBrowser: Browser;
  let mockContext: BrowserContext;
  let mockPage: Page;
  let config: BrowserPoolConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mocks
    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined)
    } as any;

    mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn().mockResolvedValue(undefined),
      clearCookies: vi.fn().mockResolvedValue(undefined),
      clearPermissions: vi.fn().mockResolvedValue(undefined),
      pages: vi.fn().mockReturnValue([mockPage])
    } as any;

    mockBrowser = {
      newContext: vi.fn().mockResolvedValue(mockContext),
      close: vi.fn().mockResolvedValue(undefined),
      contexts: vi.fn().mockReturnValue([mockContext]),
      on: vi.fn()
    } as any;

    (chromium.launch as Mock).mockResolvedValue(mockBrowser);
    
    config = {
      maxInstances: 5,
      minInstances: 1,
      resourceLimits: {
        maxMemoryPerInstance: 512,
        maxCpuPercentage: 80,
        maxConcurrentInstances: 5
      },
      browserOptions: {
        headless: true
      }
    };
  });

  afterEach(async () => {
    if (browserPool) {
      await browserPool.shutdown();
    }
  });

  describe('localStorage randomization', () => {
    it('should randomize localStorage values with random functions', async () => {
      const localStorage: LocalStorageEntry[] = [
        {
          domain: 'example.com',
          data: {
            'user_id': '{{random:uuid}}',
            'session_token': 'token-{{random:alphanumeric}}',
            'timestamp': '{{random:timestamp}}',
            'random_number': '{{random:1-100}}'
          }
        }
      ];

      config.localStorage = localStorage;
      browserPool = new BrowserPool(config);

      const eventSpy = vi.fn();
      browserPool.on('localStorageInitialized', eventSpy);

      await browserPool.initialize();

      // Verify localStorage was initialized
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'example.com',
          itemCount: 4,
          processedData: expect.objectContaining({
            user_id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
            session_token: expect.stringMatching(/^token-[A-Za-z0-9]{8}$/),
            timestamp: expect.stringMatching(/^\d+$/),
            random_number: expect.stringMatching(/^\d+$/)
          })
        })
      );

      // Verify the processed data was passed to page.evaluate
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          user_id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
          session_token: expect.stringMatching(/^token-[A-Za-z0-9]{8}$/),
          timestamp: expect.stringMatching(/^\d+$/),
          random_number: expect.stringMatching(/^\d+$/)
        })
      );
    });

    it('should randomize localStorage values with randomFrom functions', async () => {
      const localStorage: LocalStorageEntry[] = [
        {
          domain: 'app.example.com',
          data: {
            'user_type': '{{randomFrom:userIds}}',
            'device_type': '{{randomFrom:deviceTypes}}',
            'theme': '{{randomFrom:themes}}',
            'language': '{{randomFrom:languages}}'
          }
        }
      ];

      config.localStorage = localStorage;
      browserPool = new BrowserPool(config);

      const eventSpy = vi.fn();
      browserPool.on('localStorageInitialized', eventSpy);

      await browserPool.initialize();

      // Verify localStorage was initialized with randomFrom values
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'app.example.com',
          itemCount: 4,
          processedData: expect.objectContaining({
            user_type: expect.stringMatching(/^user_00[1-5]$/),
            device_type: expect.stringMatching(/^(desktop|mobile|tablet)$/),
            theme: expect.stringMatching(/^(light|dark|auto)$/),
            language: expect.stringMatching(/^(en|es|fr|de|ja)$/)
          })
        })
      );
    });

    it('should handle complex JSON structures with randomization', async () => {
      const localStorage: LocalStorageEntry[] = [
        {
          domain: 'complex.example.com',
          data: {
            'user_preferences': '{"userId":"{{randomFrom:userIds}}","theme":"{{randomFrom:themes}}","notifications":true}',
            'cart_data': '[{"id":"{{random:uuid}}","quantity":{{random:1-5}}}]',
            'session_info': '{"sessionId":"{{sessionId}}","timestamp":{{random:timestamp}},"deviceType":"{{randomFrom:deviceTypes}}"}'
          }
        }
      ];

      config.localStorage = localStorage;
      browserPool = new BrowserPool(config);

      const eventSpy = vi.fn();
      browserPool.on('localStorageInitialized', eventSpy);

      await browserPool.initialize();

      // Get the processed data from the event
      const eventCall = eventSpy.mock.calls[0][0];
      const processedData = eventCall.processedData;

      // Verify JSON structures are valid and contain randomized values
      const userPrefs = JSON.parse(processedData.user_preferences);
      expect(userPrefs.userId).toMatch(/^user_00[1-5]$/);
      expect(userPrefs.theme).toMatch(/^(light|dark|auto)$/);
      expect(userPrefs.notifications).toBe(true);

      const cartData = JSON.parse(processedData.cart_data);
      expect(cartData[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(cartData[0].quantity).toBeGreaterThanOrEqual(1);
      expect(cartData[0].quantity).toBeLessThanOrEqual(5);

      const sessionInfo = JSON.parse(processedData.session_info);
      expect(sessionInfo.sessionId).toMatch(/^sess-\d+-[a-z0-9]{9}$/);
      expect(String(sessionInfo.timestamp)).toMatch(/^\d+$/);
      expect(sessionInfo.deviceType).toMatch(/^(desktop|mobile|tablet)$/);
    });

    it('should generate different values for different browser instances', async () => {
      const localStorage: LocalStorageEntry[] = [
        {
          domain: 'unique.example.com',
          data: {
            'unique_id': '{{random:uuid}}',
            'user_id': '{{randomFrom:userIds}}',
            'session_token': '{{random:alphanumeric}}'
          }
        }
      ];

      config.localStorage = localStorage;
      config.minInstances = 2; // Force creation of multiple instances
      browserPool = new BrowserPool(config);

      const eventSpy = vi.fn();
      browserPool.on('localStorageInitialized', eventSpy);

      // Initialize will create minInstances (2) browser instances
      await browserPool.initialize();

      // Verify that localStorage was initialized multiple times (once per instance)
      expect(eventSpy).toHaveBeenCalledTimes(2);

      // Get the processed data from both events
      const event1Data = eventSpy.mock.calls[0][0].processedData;
      const event2Data = eventSpy.mock.calls[1][0].processedData;

      // Verify that different values were generated (UUIDs should be different)
      expect(event1Data.unique_id).not.toBe(event2Data.unique_id);
      expect(event1Data.session_token).not.toBe(event2Data.session_token);
      
      // User IDs might be the same (random selection from array), but that's expected
    });

    it('should handle mixed randomized and static values', async () => {
      const localStorage: LocalStorageEntry[] = [
        {
          domain: 'mixed.example.com',
          data: {
            'static_value': 'this_is_static',
            'dynamic_id': '{{random:uuid}}',
            'mixed_value': 'prefix-{{random:number}}-suffix',
            'another_static': 'also_static'
          }
        }
      ];

      config.localStorage = localStorage;
      browserPool = new BrowserPool(config);

      const eventSpy = vi.fn();
      browserPool.on('localStorageInitialized', eventSpy);

      await browserPool.initialize();

      const processedData = eventSpy.mock.calls[0][0].processedData;

      // Verify static values remain unchanged
      expect(processedData.static_value).toBe('this_is_static');
      expect(processedData.another_static).toBe('also_static');

      // Verify dynamic values were processed
      expect(processedData.dynamic_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(processedData.mixed_value).toMatch(/^prefix-\d+-suffix$/);
    });

    it('should handle randomization errors gracefully', async () => {
      const localStorage: LocalStorageEntry[] = [
        {
          domain: 'error.example.com',
          data: {
            'valid_value': '{{random:uuid}}',
            'invalid_random': '{{random:unknown_function}}',
            'invalid_array': '{{randomFrom:nonExistentArray}}',
            'static_value': 'remains_unchanged'
          }
        }
      ];

      config.localStorage = localStorage;
      browserPool = new BrowserPool(config);

      const eventSpy = vi.fn();
      browserPool.on('localStorageInitialized', eventSpy);

      await browserPool.initialize();

      const processedData = eventSpy.mock.calls[0][0].processedData;

      // Valid randomization should work
      expect(processedData.valid_value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      // Invalid randomizations should remain as-is (graceful fallback)
      expect(processedData.invalid_random).toBe('random:unknown_function');
      expect(processedData.invalid_array).toBe('randomFrom:nonExistentArray');

      // Static values should remain unchanged
      expect(processedData.static_value).toBe('remains_unchanged');
    });

    it('should work with multiple domains and different randomization patterns', async () => {
      const localStorage: LocalStorageEntry[] = [
        {
          domain: 'auth.example.com',
          data: {
            'auth_token': 'Bearer {{random:uuid}}',
            'user_id': '{{randomFrom:userIds}}',
            'expires_at': '{{random:timestamp}}'
          }
        },
        {
          domain: 'preferences.example.com',
          data: {
            'theme': '{{randomFrom:themes}}',
            'language': '{{randomFrom:languages}}',
            'settings': '{"volume":{{random:1-100}},"quality":"{{randomFrom:deviceTypes}}"}'
          }
        }
      ];

      config.localStorage = localStorage;
      browserPool = new BrowserPool(config);

      const eventSpy = vi.fn();
      browserPool.on('localStorageInitialized', eventSpy);

      await browserPool.initialize();

      // Should have been called twice (once for each domain)
      expect(eventSpy).toHaveBeenCalledTimes(2);

      // Verify first domain (auth)
      const authEvent = eventSpy.mock.calls.find(call => call[0].domain === 'auth.example.com')[0];
      expect(authEvent.processedData.auth_token).toMatch(/^Bearer [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(authEvent.processedData.user_id).toMatch(/^user_00[1-5]$/);
      expect(authEvent.processedData.expires_at).toMatch(/^\d+$/);

      // Verify second domain (preferences)
      const prefsEvent = eventSpy.mock.calls.find(call => call[0].domain === 'preferences.example.com')[0];
      expect(prefsEvent.processedData.theme).toMatch(/^(light|dark|auto)$/);
      expect(prefsEvent.processedData.language).toMatch(/^(en|es|fr|de|ja)$/);
      
      const settings = JSON.parse(prefsEvent.processedData.settings);
      expect(settings.volume).toBeGreaterThanOrEqual(1);
      expect(settings.volume).toBeLessThanOrEqual(100);
      expect(settings.quality).toMatch(/^(desktop|mobile|tablet)$/);
    });
  });
});