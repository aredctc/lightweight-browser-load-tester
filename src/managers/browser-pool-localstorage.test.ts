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

describe('BrowserPool localStorage functionality', () => {
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

  describe('localStorage initialization', () => {
    it('should initialize localStorage for single domain', async () => {
      const localStorage: LocalStorageEntry[] = [
        {
          domain: 'example.com',
          data: {
            'auth_token': 'token123',
            'user_id': '456'
          }
        }
      ];

      config.localStorage = localStorage;
      browserPool = new BrowserPool(config);

      await browserPool.initialize();

      // Verify page.goto was called with the domain
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          waitUntil: 'domcontentloaded',
          timeout: 10000
        })
      );

      // Verify localStorage data was set
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        { 'auth_token': 'token123', 'user_id': '456' }
      );

      // Verify navigation to about:blank after setup
      expect(mockPage.goto).toHaveBeenCalledWith('about:blank');
    });

    it('should initialize localStorage for multiple domains', async () => {
      const localStorage: LocalStorageEntry[] = [
        {
          domain: 'app.example.com',
          data: {
            'session_id': 'sess123'
          }
        },
        {
          domain: 'api.example.com',
          data: {
            'api_key': 'key456'
          }
        }
      ];

      config.localStorage = localStorage;
      browserPool = new BrowserPool(config);

      await browserPool.initialize();

      // Verify both domains were visited
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://app.example.com',
        expect.objectContaining({
          waitUntil: 'domcontentloaded',
          timeout: 10000
        })
      );
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.objectContaining({
          waitUntil: 'domcontentloaded',
          timeout: 10000
        })
      );

      // Verify localStorage data was set for both domains
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        { 'session_id': 'sess123' }
      );
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        { 'api_key': 'key456' }
      );
    });

    it('should handle domains with protocol', async () => {
      const localStorage: LocalStorageEntry[] = [
        {
          domain: 'https://secure.example.com',
          data: {
            'secure_token': 'secure123'
          }
        }
      ];

      config.localStorage = localStorage;
      browserPool = new BrowserPool(config);

      await browserPool.initialize();

      // Verify the domain was used as-is since it already has protocol
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://secure.example.com',
        expect.objectContaining({
          waitUntil: 'domcontentloaded',
          timeout: 10000
        })
      );
    });

    it('should emit events for successful localStorage initialization', async () => {
      const localStorage: LocalStorageEntry[] = [
        {
          domain: 'example.com',
          data: {
            'test_key': 'test_value'
          }
        }
      ];

      config.localStorage = localStorage;
      browserPool = new BrowserPool(config);

      const eventSpy = vi.fn();
      browserPool.on('localStorageInitialized', eventSpy);

      await browserPool.initialize();

      expect(eventSpy).toHaveBeenCalledWith({
        domain: 'example.com',
        itemCount: 1,
        processedData: {
          'test_key': 'test_value'
        }
      });
    });

    it('should emit events for failed localStorage initialization', async () => {
      const localStorage: LocalStorageEntry[] = [
        {
          domain: 'invalid-domain.com',
          data: {
            'test_key': 'test_value'
          }
        }
      ];

      config.localStorage = localStorage;
      browserPool = new BrowserPool(config);

      // Mock page.goto to throw an error
      mockPage.goto.mockRejectedValueOnce(new Error('Navigation failed'));

      const eventSpy = vi.fn();
      browserPool.on('localStorageInitializationFailed', eventSpy);

      await browserPool.initialize();

      expect(eventSpy).toHaveBeenCalledWith({
        domain: 'invalid-domain.com',
        error: expect.any(Error)
      });
    });

    it('should continue with other domains if one fails', async () => {
      const localStorage: LocalStorageEntry[] = [
        {
          domain: 'failing-domain.com',
          data: {
            'key1': 'value1'
          }
        },
        {
          domain: 'working-domain.com',
          data: {
            'key2': 'value2'
          }
        }
      ];

      config.localStorage = localStorage;
      browserPool = new BrowserPool(config);

      // Mock first domain to fail, second to succeed
      mockPage.goto
        .mockRejectedValueOnce(new Error('First domain failed'))
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined); // for about:blank

      const successSpy = vi.fn();
      const failSpy = vi.fn();
      browserPool.on('localStorageInitialized', successSpy);
      browserPool.on('localStorageInitializationFailed', failSpy);

      await browserPool.initialize();

      expect(failSpy).toHaveBeenCalledWith({
        domain: 'failing-domain.com',
        error: expect.any(Error)
      });

      expect(successSpy).toHaveBeenCalledWith({
        domain: 'working-domain.com',
        itemCount: 1,
        processedData: {
          'key2': 'value2'
        }
      });
    });

    it('should not initialize localStorage if not configured', async () => {
      // No localStorage in config
      browserPool = new BrowserPool(config);

      await browserPool.initialize();

      // Should not call page.goto for localStorage setup
      expect(mockPage.goto).not.toHaveBeenCalled();
    });

    it('should not initialize localStorage if empty array', async () => {
      config.localStorage = [];
      browserPool = new BrowserPool(config);

      await browserPool.initialize();

      // Should not call page.goto for localStorage setup
      expect(mockPage.goto).not.toHaveBeenCalled();
    });

    it('should handle complex localStorage data', async () => {
      const localStorage: LocalStorageEntry[] = [
        {
          domain: 'complex.example.com',
          data: {
            'user_preferences': '{"theme":"dark","language":"en"}',
            'cart_items': '[{"id":"123","quantity":2}]',
            'simple_string': 'test_value',
            'number_as_string': '42'
          }
        }
      ];

      config.localStorage = localStorage;
      browserPool = new BrowserPool(config);

      await browserPool.initialize();

      // Verify all localStorage items were set
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        {
          'user_preferences': '{"theme":"dark","language":"en"}',
          'cart_items': '[{"id":"123","quantity":2}]',
          'simple_string': 'test_value',
          'number_as_string': '42'
        }
      );
    });
  });


});