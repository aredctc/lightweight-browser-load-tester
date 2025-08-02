import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RequestInterceptor, InterceptedRequest } from './request-interceptor';
import { ParameterTemplate } from '../types';

// Mock Playwright types
const _mockRoute = {
  continue: vi.fn(),
  fulfill: vi.fn(),
  abort: vi.fn()
};

const mockRequest = {
  url: vi.fn(),
  method: vi.fn(),
  headers: vi.fn(),
  postData: vi.fn(),
  timing: vi.fn(),
  failure: vi.fn()
};

const mockResponse = {
  status: vi.fn(),
  request: vi.fn(() => mockRequest),
  headers: vi.fn()
};

const mockPage = {
  route: vi.fn(),
  unroute: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
};

describe('RequestInterceptor', () => {
  let interceptor: RequestInterceptor;
  let parameterTemplates: ParameterTemplate[];

  beforeEach(() => {
    vi.clearAllMocks();

    parameterTemplates = [
      {
        target: 'header',
        name: 'X-Session-ID',
        valueTemplate: '{{sessionId}}',
        scope: 'per-session'
      },
      {
        target: 'query',
        name: 'timestamp',
        valueTemplate: '{{timestamp}}',
        scope: 'global'
      },
      {
        target: 'body',
        name: 'requestId',
        valueTemplate: 'req_{{requestCount}}',
        scope: 'per-session'
      }
    ];

    interceptor = new RequestInterceptor(
      mockPage as any,
      parameterTemplates,
      { sessionId: 'test-session-123', customVar: 'custom-value' },
      false, // streamingOnly
      [], // allowedUrls
      [] // blockedUrls
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default context when no initial context provided', () => {
      const defaultInterceptor = new RequestInterceptor(mockPage as any);
      expect(defaultInterceptor).toBeDefined();
    });

    it('should merge initial context with defaults', () => {
      const context = { sessionId: 'custom-session' };
      const customInterceptor = new RequestInterceptor(mockPage as any, [], context);
      expect(customInterceptor).toBeDefined();
    });
  });

  describe('startInterception', () => {
    it('should set up route handler and event listeners', async () => {
      await interceptor.startInterception();

      expect(mockPage.route).toHaveBeenCalledWith('**/*', expect.any(Function));
      expect(mockPage.on).toHaveBeenCalledWith('response', expect.any(Function));
      expect(mockPage.on).toHaveBeenCalledWith('requestfailed', expect.any(Function));
    });

    it('should handle errors during setup', async () => {
      mockPage.route.mockRejectedValueOnce(new Error('Setup failed'));

      await expect(interceptor.startInterception()).rejects.toThrow('Setup failed');
    });
  });

  describe('stopInterception', () => {
    it('should remove route handlers', async () => {
      await interceptor.stopInterception();

      expect(mockPage.unroute).toHaveBeenCalledWith('**/*');
    });

    it('should handle errors during cleanup', async () => {
      mockPage.unroute.mockRejectedValueOnce(new Error('Cleanup failed'));

      // Should not throw, just log error
      await expect(interceptor.stopInterception()).resolves.toBeUndefined();
    });
  });

  describe('updateContext', () => {
    it('should update variable context', () => {
      const updates = { customVar: 'updated-value', newVar: 'new-value' };

      interceptor.updateContext(updates);

      // Test by checking if variable substitution works with updated values
      const result = (interceptor as any).substituteVariables('{{customVar}}-{{newVar}}');
      expect(result).toBe('updated-value-new-value');
    });

    it('should update timestamp on context update', () => {
      const beforeTime = Date.now();
      interceptor.updateContext({ customVar: 'test' });
      const afterTime = Date.now();

      // Timestamp should be updated to current time
      const context = (interceptor as any).variableContext;
      expect(context.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(context.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('variable substitution', () => {
    it('should substitute single variable', () => {
      const result = (interceptor as any).substituteVariables('{{sessionId}}');
      expect(result).toBe('test-session-123');
    });

    it('should substitute multiple variables', () => {
      const result = (interceptor as any).substituteVariables('{{sessionId}}-{{customVar}}');
      expect(result).toBe('test-session-123-custom-value');
    });

    it('should leave unknown variables unchanged', () => {
      const result = (interceptor as any).substituteVariables('{{unknownVar}}');
      expect(result).toBe('{{unknownVar}}');
    });

    it('should handle mixed known and unknown variables', () => {
      const result = (interceptor as any).substituteVariables('{{sessionId}}-{{unknownVar}}-{{customVar}}');
      expect(result).toBe('test-session-123-{{unknownVar}}-custom-value');
    });
  });

  describe('query parameter modification', () => {
    it('should add query parameter to URL without existing params', () => {
      const url = 'https://example.com/api/test';
      const result = (interceptor as any).addQueryParameter(url, 'param1', 'value1');
      expect(result).toBe('https://example.com/api/test?param1=value1');
    });

    it('should add query parameter to URL with existing params', () => {
      const url = 'https://example.com/api/test?existing=value';
      const result = (interceptor as any).addQueryParameter(url, 'param1', 'value1');
      expect(result).toBe('https://example.com/api/test?existing=value&param1=value1');
    });

    it('should replace existing query parameter', () => {
      const url = 'https://example.com/api/test?param1=oldvalue';
      const result = (interceptor as any).addQueryParameter(url, 'param1', 'newvalue');
      expect(result).toBe('https://example.com/api/test?param1=newvalue');
    });

    it('should handle invalid URLs gracefully', () => {
      const invalidUrl = 'not-a-valid-url';
      const result = (interceptor as any).addQueryParameter(invalidUrl, 'param1', 'value1');
      expect(result).toBe(invalidUrl); // Should return original URL
    });
  });

  describe('request body modification', () => {
    it('should modify JSON request body', () => {
      const jsonBody = '{"existing":"value"}';
      const result = (interceptor as any).modifyRequestBody(jsonBody, 'newField', 'newValue');

      const parsed = JSON.parse(result);
      expect(parsed.existing).toBe('value');
      expect(parsed.newField).toBe('newValue');
    });

    it('should modify form data request body', () => {
      const formBody = 'existing=value&other=data';
      const result = (interceptor as any).modifyRequestBody(formBody, 'newField', 'newValue');

      const params = new URLSearchParams(result);
      expect(params.get('existing')).toBe('value');
      expect(params.get('other')).toBe('data');
      expect(params.get('newField')).toBe('newValue');
    });

    it('should handle unsupported body formats gracefully', () => {
      const unsupportedBody = 'some random text that is not JSON or form data';
      const result = (interceptor as any).modifyRequestBody(unsupportedBody, 'field', 'value');
      expect(result).toBe(unsupportedBody); // Should return original
    });

    it('should handle empty body', () => {
      const result = (interceptor as any).modifyRequestBody('', 'field', 'value');
      expect(result).toBe(''); // Should return original empty string
    });
  });

  describe('request modification', () => {
    it('should modify headers based on parameter templates', () => {
      const request: InterceptedRequest = {
        url: 'https://example.com/api/test',
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      };

      const result = (interceptor as any).modifyRequest(request);

      expect(result.modified).toBe(true);
      expect(result.modifiedHeaders).toEqual({
        'Content-Type': 'application/json',
        'X-Session-ID': 'test-session-123'
      });
    });

    it('should modify query parameters based on parameter templates', () => {
      const request: InterceptedRequest = {
        url: 'https://example.com/api/test',
        method: 'GET',
        headers: {}
      };

      const result = (interceptor as any).modifyRequest(request);

      expect(result.modified).toBe(true);
      expect(result.modifiedUrl).toContain('timestamp=');
    });

    it('should modify request body based on parameter templates', () => {
      const request: InterceptedRequest = {
        url: 'https://example.com/api/test',
        method: 'POST',
        headers: {},
        postData: '{"existing":"value"}'
      };

      const result = (interceptor as any).modifyRequest(request);

      expect(result.modified).toBe(true);
      expect(result.modifiedPostData).toBeDefined();

      const parsed = JSON.parse(result.modifiedPostData!);
      expect(parsed.requestId).toMatch(/^req_\d+$/);
    });

    it('should not modify request when no templates match', () => {
      const emptyInterceptor = new RequestInterceptor(mockPage as any, []);
      const request: InterceptedRequest = {
        url: 'https://example.com/api/test',
        method: 'GET',
        headers: {}
      };

      const result = (emptyInterceptor as any).modifyRequest(request);

      expect(result.modified).toBe(false);
      expect(result.modifiedUrl).toBeUndefined();
      expect(result.modifiedHeaders).toBeUndefined();
    });
  });

  describe('metrics collection', () => {
    it('should collect network metrics from response', () => {
      mockRequest.url.mockReturnValue('https://example.com/api/test');
      mockRequest.method.mockReturnValue('GET');
      mockRequest.timing.mockReturnValue({
        requestStart: 100,
        responseEnd: 200
      });
      mockResponse.status.mockReturnValue(200);

      (interceptor as any).collectNetworkMetrics(mockResponse);

      const metrics = interceptor.getNetworkMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        url: 'https://example.com/api/test',
        method: 'GET',
        responseTime: 100,
        statusCode: 200
      });
    });

    it('should handle missing timing information', () => {
      mockRequest.url.mockReturnValue('https://example.com/api/test');
      mockRequest.method.mockReturnValue('GET');
      mockRequest.timing.mockReturnValue(null);
      mockResponse.status.mockReturnValue(200);

      (interceptor as any).collectNetworkMetrics(mockResponse);

      const metrics = interceptor.getNetworkMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].responseTime).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should log request failures', () => {
      mockRequest.url.mockReturnValue('https://example.com/api/test');
      mockRequest.method.mockReturnValue('GET');
      mockRequest.failure.mockReturnValue({ errorText: 'Network error' });

      (interceptor as any).logRequestFailure(mockRequest);

      const errors = interceptor.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Request failed');
      expect(errors[0].context?.failure).toBe('Network error');
    });

    it('should handle template application errors gracefully', () => {
      const _badTemplate: ParameterTemplate = {
        target: 'header',
        name: 'X-Test',
        valueTemplate: '{{sessionId}}',
        scope: 'global'
      };

      // Mock substituteVariables to throw error
      const originalSubstitute = (interceptor as any).substituteVariables;
      (interceptor as any).substituteVariables = vi.fn().mockImplementation(() => {
        throw new Error('Template error');
      });

      const request: InterceptedRequest = {
        url: 'https://example.com/api/test',
        method: 'GET',
        headers: {}
      };

      const result = (interceptor as any).modifyRequest(request);

      expect(result.modified).toBe(false); // Should not modify on error

      const errors = interceptor.getErrors();
      expect(errors.length).toBeGreaterThan(0);

      // Restore original method
      (interceptor as any).substituteVariables = originalSubstitute;
    });
  });

  describe('metrics management', () => {
    it('should clear metrics and errors', () => {
      // Add some metrics and errors first
      (interceptor as any).networkMetrics.push({
        url: 'test',
        method: 'GET',
        responseTime: 100,
        statusCode: 200,
        timestamp: new Date(),
        requestSize: 100,
        responseSize: 200
      });

      (interceptor as any).errors.push({
        timestamp: new Date(),
        level: 'error',
        message: 'Test error'
      });

      expect(interceptor.getNetworkMetrics()).toHaveLength(1);
      expect(interceptor.getErrors()).toHaveLength(1);

      interceptor.clearMetrics();

      expect(interceptor.getNetworkMetrics()).toHaveLength(0);
      expect(interceptor.getErrors()).toHaveLength(0);
    });

    it('should return copies of metrics arrays', () => {
      const metrics = interceptor.getNetworkMetrics();
      const errors = interceptor.getErrors();

      // Modifying returned arrays should not affect internal state
      metrics.push({} as any);
      errors.push({} as any);

      expect(interceptor.getNetworkMetrics()).toHaveLength(0);
      expect(interceptor.getErrors()).toHaveLength(0);
    });
  });

  describe('request size calculation', () => {
    it('should calculate request size including URL, headers, and body', () => {
      mockRequest.url.mockReturnValue('https://example.com/api/test');
      mockRequest.headers.mockReturnValue({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token123'
      });
      mockRequest.postData.mockReturnValue('{"test":"data"}');

      const size = (interceptor as any).calculateRequestSize(mockRequest);

      expect(size).toBeGreaterThan(0);
      // Should include URL length + headers + post data
      const expectedMinSize = 'https://example.com/api/test'.length +
        'Content-Type'.length + 'application/json'.length + 4 +
        'Authorization'.length + 'Bearer token123'.length + 4 +
        '{"test":"data"}'.length;
      expect(size).toBeGreaterThanOrEqual(expectedMinSize);
    });

    it('should handle requests without post data', () => {
      mockRequest.url.mockReturnValue('https://example.com/api/test');
      mockRequest.headers.mockReturnValue({});
      mockRequest.postData.mockReturnValue(null);

      const size = (interceptor as any).calculateRequestSize(mockRequest);

      expect(size).toBe('https://example.com/api/test'.length);
    });

    it('should handle calculation errors gracefully', () => {
      mockRequest.url.mockImplementation(() => {
        throw new Error('URL error');
      });

      const size = (interceptor as any).calculateRequestSize(mockRequest);

      expect(size).toBe(0);
    });
  });

  describe('streaming request detection', () => {
    it('should identify manifest files as streaming requests', () => {
      const manifestUrls = [
        'https://example.com/stream/playlist.m3u8',
        'https://example.com/content/manifest.mpd'
      ];

      manifestUrls.forEach(url => {
        const isStreaming = (interceptor as any).isStreamingRequest(url);
        expect(isStreaming).toBe(true);
      });
    });

    it('should identify media segments as streaming requests', () => {
      const segmentUrls = [
        'https://example.com/segments/segment001.ts',
        'https://example.com/media/chunk.m4s',
        'https://example.com/video/segment.mp4'
      ];

      segmentUrls.forEach(url => {
        const isStreaming = (interceptor as any).isStreamingRequest(url);
        expect(isStreaming).toBe(true);
      });
    });

    it('should identify DRM/license requests as streaming requests', () => {
      const licenseUrls = [
        'https://example.com/drm/license',
        'https://widevine.example.com/license',
        'https://example.com/playready/license'
      ];

      licenseUrls.forEach(url => {
        const isStreaming = (interceptor as any).isStreamingRequest(url);
        expect(isStreaming).toBe(true);
      });
    });

    it('should not identify regular requests as streaming requests', () => {
      const regularUrls = [
        'https://example.com/api/user',
        'https://example.com/static/image.jpg',
        'https://example.com/css/styles.css'
      ];

      regularUrls.forEach(url => {
        const isStreaming = (interceptor as any).isStreamingRequest(url);
        expect(isStreaming).toBe(false);
      });
    });
  });

  describe('streaming type classification', () => {
    it('should classify manifest requests correctly', () => {
      const manifestUrls = [
        'https://example.com/playlist.m3u8',
        'https://example.com/manifest.mpd',
        'https://example.com/api/manifest'
      ];

      manifestUrls.forEach(url => {
        const type = (interceptor as any).getStreamingType(url);
        expect(type).toBe('manifest');
      });
    });

    it('should classify segment requests correctly', () => {
      const segmentUrls = [
        'https://example.com/segment001.ts',
        'https://example.com/chunk.m4s',
        'https://example.com/media/segment.mp4'
      ];

      segmentUrls.forEach(url => {
        const type = (interceptor as any).getStreamingType(url);
        expect(type).toBe('segment');
      });
    });

    it('should classify license requests correctly', () => {
      const licenseUrls = [
        'https://example.com/license',
        'https://example.com/drm/widevine',
        'https://example.com/playready'
      ];

      licenseUrls.forEach(url => {
        const type = (interceptor as any).getStreamingType(url);
        expect(type).toBe('license');
      });
    });

    it('should classify API requests correctly', () => {
      const apiUrls = [
        'https://example.com/api/stream',
        'https://example.com/playback/start',
        'https://example.com/player/config'
      ];

      apiUrls.forEach(url => {
        const type = (interceptor as any).getStreamingType(url);
        expect(type).toBe('api');
      });
    });

    it('should return undefined for non-streaming requests', () => {
      const regularUrls = [
        'https://example.com/api/user',
        'https://example.com/static/image.jpg'
      ];

      regularUrls.forEach(url => {
        const type = (interceptor as any).getStreamingType(url);
        expect(type).toBeUndefined();
      });
    });
  });

  describe('streaming metrics collection', () => {
    beforeEach(() => {
      // Set up mock responses for streaming requests
      mockResponse.headers.mockReturnValue({
        'content-length': '1024',
        'content-type': 'application/vnd.apple.mpegurl'
      });
    });

    it('should collect streaming metrics from manifest requests', () => {
      mockRequest.url.mockReturnValue('https://example.com/playlist.m3u8');
      mockRequest.method.mockReturnValue('GET');
      mockRequest.timing.mockReturnValue({
        requestStart: 100,
        responseEnd: 300
      });
      mockResponse.status.mockReturnValue(200);

      (interceptor as any).collectNetworkMetrics(mockResponse);

      const metrics = interceptor.getNetworkMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].isStreamingRelated).toBe(true);
      expect(metrics[0].streamingType).toBe('manifest');
      expect(metrics[0].responseTime).toBe(200);
    });

    it('should collect streaming metrics from segment requests', () => {
      mockRequest.url.mockReturnValue('https://example.com/segment001.ts');
      mockRequest.method.mockReturnValue('GET');
      mockRequest.timing.mockReturnValue({
        requestStart: 50,
        responseEnd: 150
      });
      mockResponse.status.mockReturnValue(200);

      (interceptor as any).collectNetworkMetrics(mockResponse);

      const metrics = interceptor.getNetworkMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].isStreamingRelated).toBe(true);
      expect(metrics[0].streamingType).toBe('segment');
    });

    it('should log streaming errors for failed requests', () => {
      mockRequest.url.mockReturnValue('https://example.com/playlist.m3u8');
      mockRequest.method.mockReturnValue('GET');
      mockRequest.timing.mockReturnValue({
        requestStart: 100,
        responseEnd: 200
      });
      mockResponse.status.mockReturnValue(404);

      (interceptor as any).collectNetworkMetrics(mockResponse);

      const streamingErrors = interceptor.getStreamingErrors();
      expect(streamingErrors).toHaveLength(1);
      expect(streamingErrors[0].errorType).toBe('network');
      expect(streamingErrors[0].errorCode).toBe('404');
      expect(streamingErrors[0].url).toBe('https://example.com/playlist.m3u8');
    });
  });

  describe('streaming metrics aggregation', () => {
    beforeEach(() => {
      // Mock Date.now to simulate time progression
      let currentTime = 1000000;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        currentTime += 1000; // Advance by 1 second each call
        return currentTime;
      });

      interceptor.startStreamingMonitoring();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should aggregate streaming metrics correctly', () => {
      // Add mock streaming metrics
      (interceptor as any).networkMetrics = [
        {
          url: 'https://example.com/manifest.m3u8',
          method: 'GET',
          responseTime: 100,
          statusCode: 200,
          timestamp: new Date(),
          requestSize: 500,
          responseSize: 1000,
          isStreamingRelated: true,
          streamingType: 'manifest'
        },
        {
          url: 'https://example.com/segment001.ts',
          method: 'GET',
          responseTime: 50,
          statusCode: 200,
          timestamp: new Date(),
          requestSize: 200,
          responseSize: 5000,
          isStreamingRelated: true,
          streamingType: 'segment'
        },
        {
          url: 'https://example.com/license',
          method: 'POST',
          responseTime: 200,
          statusCode: 200,
          timestamp: new Date(),
          requestSize: 300,
          responseSize: 100,
          isStreamingRelated: true,
          streamingType: 'license'
        },
        {
          url: 'https://example.com/api/user',
          method: 'GET',
          responseTime: 75,
          statusCode: 200,
          timestamp: new Date(),
          requestSize: 100,
          responseSize: 200,
          isStreamingRelated: false
        }
      ];

      const streamingMetrics = interceptor.getStreamingMetrics();

      expect(streamingMetrics.manifestRequests).toBe(1);
      expect(streamingMetrics.segmentRequests).toBe(1);
      expect(streamingMetrics.licenseRequests).toBe(1);
      expect(streamingMetrics.apiRequests).toBe(0);
      expect(streamingMetrics.totalStreamingRequests).toBe(3);
      expect(streamingMetrics.averageManifestTime).toBe(100);
      expect(streamingMetrics.averageSegmentTime).toBe(50);
      expect(streamingMetrics.averageLicenseTime).toBe(200);
      expect(streamingMetrics.streamingSuccessRate).toBe(100);
      expect(streamingMetrics.bandwidthUsage).toBeGreaterThan(0);
    });

    it('should calculate success rate correctly with failed requests', () => {
      (interceptor as any).networkMetrics = [
        {
          url: 'https://example.com/manifest.m3u8',
          statusCode: 200,
          isStreamingRelated: true,
          streamingType: 'manifest'
        },
        {
          url: 'https://example.com/segment001.ts',
          statusCode: 404,
          isStreamingRelated: true,
          streamingType: 'segment'
        }
      ];

      const streamingMetrics = interceptor.getStreamingMetrics();
      expect(streamingMetrics.streamingSuccessRate).toBe(50);
    });

    it('should handle empty metrics gracefully', () => {
      const streamingMetrics = interceptor.getStreamingMetrics();

      expect(streamingMetrics.manifestRequests).toBe(0);
      expect(streamingMetrics.segmentRequests).toBe(0);
      expect(streamingMetrics.licenseRequests).toBe(0);
      expect(streamingMetrics.totalStreamingRequests).toBe(0);
      expect(streamingMetrics.streamingSuccessRate).toBe(0);
    });
  });

  describe('streaming monitoring lifecycle', () => {
    it('should start streaming monitoring and set timestamp', () => {
      const beforeTime = Date.now();
      interceptor.startStreamingMonitoring();
      const afterTime = Date.now();

      const startTime = (interceptor as any).streamingStartTime;
      expect(startTime).toBeGreaterThanOrEqual(beforeTime);
      expect(startTime).toBeLessThanOrEqual(afterTime);
    });

    it('should clear streaming metrics and errors', () => {
      // Add some streaming data
      (interceptor as any).streamingErrors.push({
        timestamp: new Date(),
        errorType: 'manifest',
        errorMessage: 'Test error'
      });

      interceptor.startStreamingMonitoring();

      expect(interceptor.getStreamingErrors()).toHaveLength(1);

      interceptor.clearMetrics();

      expect(interceptor.getStreamingErrors()).toHaveLength(0);
      expect((interceptor as any).streamingStartTime).toBe(0);
    });

    it('should return copies of streaming errors array', () => {
      const errors = interceptor.getStreamingErrors();
      errors.push({} as any);

      expect(interceptor.getStreamingErrors()).toHaveLength(0);
    });
  });

  describe('response size calculation', () => {
    it('should calculate response size from content-length header', () => {
      mockResponse.headers.mockReturnValue({
        'content-length': '2048',
        'content-type': 'application/json'
      });

      const size = (interceptor as any).calculateResponseSize(mockResponse);
      expect(size).toBe(2048);
    });

    it('should estimate response size from headers when no content-length', () => {
      mockResponse.headers.mockReturnValue({
        'content-type': 'application/json',
        'cache-control': 'no-cache'
      });

      const size = (interceptor as any).calculateResponseSize(mockResponse);
      expect(size).toBeGreaterThan(0);
      // Should include header sizes
      const expectedMinSize = 'content-type'.length + 'application/json'.length + 4 +
        'cache-control'.length + 'no-cache'.length + 4;
      expect(size).toBeGreaterThanOrEqual(expectedMinSize);
    });

    it('should handle response size calculation errors', () => {
      mockResponse.headers.mockImplementation(() => {
        throw new Error('Headers error');
      });

      const size = (interceptor as any).calculateResponseSize(mockResponse);
      expect(size).toBe(0);
    });
  });

  describe('average response time calculation', () => {
    it('should calculate average response time correctly', () => {
      const metrics = [
        { responseTime: 100 },
        { responseTime: 200 },
        { responseTime: 300 }
      ];

      const average = (interceptor as any).calculateAverageResponseTime(metrics);
      expect(average).toBe(200);
    });

    it('should return 0 for empty metrics array', () => {
      const average = (interceptor as any).calculateAverageResponseTime([]);
      expect(average).toBe(0);
    });
  });

  // NEW TESTS FOR SELECTIVE REQUEST TARGETING
  describe('selective request targeting', () => {
    let selectiveInterceptor: RequestInterceptor;
    let _mockRoute: any;

    beforeEach(() => {
      _mockRoute = {
        continue: vi.fn(),
        abort: vi.fn()
      };

      const selectiveTemplates: ParameterTemplate[] = [
        {
          target: 'header',
          name: 'X-API-Token',
          valueTemplate: 'api_{{random:uuid}}',
          scope: 'per-session',
          urlPattern: '*/api/*'
        },
        {
          target: 'header',
          name: 'X-Auth-Token',
          valueTemplate: 'auth_{{sessionId}}',
          scope: 'per-session',
          urlPattern: '*/auth/*',
          method: 'POST'
        },
        {
          target: 'query',
          name: 'manifest_id',
          valueTemplate: '{{random:alphanumeric}}',
          scope: 'global',
          urlPattern: '*.m3u8'
        },
        {
          target: 'body',
          name: 'analytics_data',
          valueTemplate: '{"timestamp": {{timestamp}}}',
          scope: 'per-session',
          urlPattern: '*/analytics/*',
          method: 'POST'
        }
      ];

      selectiveInterceptor = new RequestInterceptor(
        mockPage as any,
        selectiveTemplates,
        { sessionId: 'test-session-123' },
        false, // streamingOnly = false
        [], // allowedUrls
        [] // blockedUrls
      );
    });

    describe('shouldApplyTemplate', () => {
      it('should apply template when no filters are specified', () => {
        const template: ParameterTemplate = {
          target: 'header',
          name: 'X-Global',
          valueTemplate: 'global',
          scope: 'global'
        };

        const result = (selectiveInterceptor as any).shouldApplyTemplate(
          template,
          'https://example.com/any/url',
          'GET'
        );

        expect(result).toBe(true);
      });

      it('should apply template when URL pattern matches', () => {
        const template: ParameterTemplate = {
          target: 'header',
          name: 'X-API',
          valueTemplate: 'api',
          scope: 'global',
          urlPattern: '*/api/*'
        };

        const result = (selectiveInterceptor as any).shouldApplyTemplate(
          template,
          'https://example.com/api/users',
          'GET'
        );

        expect(result).toBe(true);
      });

      it('should not apply template when URL pattern does not match', () => {
        const template: ParameterTemplate = {
          target: 'header',
          name: 'X-API',
          valueTemplate: 'api',
          scope: 'global',
          urlPattern: '*/api/*'
        };

        const result = (selectiveInterceptor as any).shouldApplyTemplate(
          template,
          'https://example.com/static/image.jpg',
          'GET'
        );

        expect(result).toBe(false);
      });

      it('should apply template when HTTP method matches', () => {
        const template: ParameterTemplate = {
          target: 'header',
          name: 'X-POST',
          valueTemplate: 'post',
          scope: 'global',
          method: 'POST'
        };

        const result = (selectiveInterceptor as any).shouldApplyTemplate(
          template,
          'https://example.com/any/url',
          'POST'
        );

        expect(result).toBe(true);
      });

      it('should not apply template when HTTP method does not match', () => {
        const template: ParameterTemplate = {
          target: 'header',
          name: 'X-POST',
          valueTemplate: 'post',
          scope: 'global',
          method: 'POST'
        };

        const result = (selectiveInterceptor as any).shouldApplyTemplate(
          template,
          'https://example.com/any/url',
          'GET'
        );

        expect(result).toBe(false);
      });

      it('should apply template when both URL pattern and method match', () => {
        const template: ParameterTemplate = {
          target: 'header',
          name: 'X-AUTH',
          valueTemplate: 'auth',
          scope: 'global',
          urlPattern: '*/auth/*',
          method: 'POST'
        };

        const result = (selectiveInterceptor as any).shouldApplyTemplate(
          template,
          'https://example.com/auth/login',
          'POST'
        );

        expect(result).toBe(true);
      });

      it('should not apply template when URL matches but method does not', () => {
        const template: ParameterTemplate = {
          target: 'header',
          name: 'X-AUTH',
          valueTemplate: 'auth',
          scope: 'global',
          urlPattern: '*/auth/*',
          method: 'POST'
        };

        const result = (selectiveInterceptor as any).shouldApplyTemplate(
          template,
          'https://example.com/auth/login',
          'GET'
        );

        expect(result).toBe(false);
      });

      it('should not apply template when method matches but URL does not', () => {
        const template: ParameterTemplate = {
          target: 'header',
          name: 'X-AUTH',
          valueTemplate: 'auth',
          scope: 'global',
          urlPattern: '*/auth/*',
          method: 'POST'
        };

        const result = (selectiveInterceptor as any).shouldApplyTemplate(
          template,
          'https://example.com/api/users',
          'POST'
        );

        expect(result).toBe(false);
      });
    });

    describe('URL pattern matching', () => {
      it('should match wildcard patterns', () => {
        const patterns = [
          { pattern: '*/api/*', url: 'https://example.com/api/users', expected: true },
          { pattern: '*/api/*', url: 'https://example.com/static/image.jpg', expected: false },
          { pattern: '*.m3u8', url: 'https://cdn.example.com/playlist.m3u8', expected: true },
          { pattern: '*.m3u8', url: 'https://cdn.example.com/segment.ts', expected: false },
          { pattern: '*staging*', url: 'https://staging.example.com/api', expected: true },
          { pattern: '*staging*', url: 'https://prod.example.com/api', expected: false }
        ];

        patterns.forEach(({ pattern, url, expected }) => {
          const result = (selectiveInterceptor as any).matchesUrlPattern(url, pattern);
          expect(result).toBe(expected);
        });
      });

      it('should match regex patterns', () => {
        const patterns = [
          {
            pattern: '/^https:\\/\\/cdn[0-9]+\\.example\\.com/',
            url: 'https://cdn1.example.com/file.js',
            expected: true
          },
          {
            pattern: '/^https:\\/\\/cdn[0-9]+\\.example\\.com/',
            url: 'https://api.example.com/file.js',
            expected: false
          },
          {
            pattern: '/api\\/v[0-9]+/',
            url: 'https://example.com/api/v2/users',
            expected: true
          },
          {
            pattern: '/api\\/v[0-9]+/',
            url: 'https://example.com/api/users',
            expected: false
          }
        ];

        patterns.forEach(({ pattern, url, expected }) => {
          const result = (selectiveInterceptor as any).matchesUrlPattern(url, pattern);
          expect(result).toBe(expected);
        });
      });

      it('should handle invalid regex patterns gracefully', () => {
        const result = (selectiveInterceptor as any).matchesUrlPattern(
          'https://example.com/api/users',
          '/[invalid regex/'
        );

        // Should fall back to string matching
        expect(result).toBe(false);
      });
    });

    describe('selective parameter application', () => {
      it('should apply parameters only to matching API requests', () => {
        const request = {
          url: 'https://example.com/api/users',
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          postData: undefined
        };

        const result = (selectiveInterceptor as any).modifyRequest(request);

        expect(result.modified).toBe(true);
        expect(result.modifiedHeaders).toHaveProperty('X-API-Token');
        expect(result.modifiedHeaders['X-API-Token']).toMatch(/^api_[a-f0-9-]+$/);
        expect(result.modifiedHeaders).not.toHaveProperty('X-Auth-Token');
      });

      it('should apply parameters only to matching auth POST requests', () => {
        const request = {
          url: 'https://example.com/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          postData: '{"username": "test"}'
        };

        const result = (selectiveInterceptor as any).modifyRequest(request);

        expect(result.modified).toBe(true);
        expect(result.modifiedHeaders).toHaveProperty('X-Auth-Token');
        expect(result.modifiedHeaders['X-Auth-Token']).toBe('auth_test-session-123');
      });

      it('should not apply auth parameters to auth GET requests', () => {
        const request = {
          url: 'https://example.com/auth/status',
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          postData: undefined
        };

        const result = (selectiveInterceptor as any).modifyRequest(request);

        expect(result.modified).toBe(false);
        expect(result.modifiedHeaders).toBeUndefined();
      });

      it('should apply query parameters to manifest requests', () => {
        const request = {
          url: 'https://cdn.example.com/playlist.m3u8',
          method: 'GET',
          headers: {},
          postData: undefined
        };

        const result = (selectiveInterceptor as any).modifyRequest(request);

        expect(result.modified).toBe(true);
        expect(result.modifiedUrl).toContain('manifest_id=');
        expect(result.modifiedUrl).toMatch(/manifest_id=[A-Za-z0-9]{8}/);
      });

      it('should apply body parameters to analytics POST requests', () => {
        const request = {
          url: 'https://example.com/analytics/track',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          postData: '{"event": "click"}'
        };

        const result = (selectiveInterceptor as any).modifyRequest(request);

        expect(result.modified).toBe(true);
        expect(result.modifiedPostData).toBeDefined();

        const parsedBody = JSON.parse(result.modifiedPostData!);
        expect(parsedBody.event).toBe('click');
        expect(parsedBody.analytics_data).toEqual({ timestamp: expect.any(Number) });
      });

      it('should not apply parameters to non-matching requests', () => {
        const request = {
          url: 'https://example.com/static/image.jpg',
          method: 'GET',
          headers: {},
          postData: undefined
        };

        const result = (selectiveInterceptor as any).modifyRequest(request);

        expect(result.modified).toBe(false);
        expect(result.modifiedHeaders).toBeUndefined();
        expect(result.modifiedUrl).toBeUndefined();
      });

      it('should apply multiple parameters when multiple patterns match', () => {
        // Create interceptor with overlapping patterns
        const overlappingTemplates: ParameterTemplate[] = [
          {
            target: 'header',
            name: 'X-API-Token',
            valueTemplate: 'api_token',
            scope: 'global',
            urlPattern: '*/api/*'
          },
          {
            target: 'header',
            name: 'X-Service-Token',
            valueTemplate: 'service_token',
            scope: 'global',
            urlPattern: '*/api/service/*'
          },
          {
            target: 'query',
            name: 'version',
            valueTemplate: 'v2',
            scope: 'global',
            urlPattern: '*/api/*'
          }
        ];

        const overlappingInterceptor = new RequestInterceptor(
          mockPage as any,
          overlappingTemplates,
          { sessionId: 'test' }
        );

        const request = {
          url: 'https://example.com/api/service/users',
          method: 'GET',
          headers: {},
          postData: undefined
        };

        const result = (overlappingInterceptor as any).modifyRequest(request);

        expect(result.modified).toBe(true);
        expect(result.modifiedHeaders).toHaveProperty('X-API-Token', 'api_token');
        expect(result.modifiedHeaders).toHaveProperty('X-Service-Token', 'service_token');
        expect(result.modifiedUrl).toContain('version=v2');
      });
    });

    describe('case sensitivity', () => {
      it('should handle HTTP method case insensitively', () => {
        const template: ParameterTemplate = {
          target: 'header',
          name: 'X-POST',
          valueTemplate: 'post',
          scope: 'global',
          method: 'post'  // lowercase
        };

        const resultUpper = (selectiveInterceptor as any).shouldApplyTemplate(
          template,
          'https://example.com/any/url',
          'POST'  // uppercase
        );

        const resultLower = (selectiveInterceptor as any).shouldApplyTemplate(
          template,
          'https://example.com/any/url',
          'post'  // lowercase
        );

        expect(resultUpper).toBe(true);
        expect(resultLower).toBe(true);
      });

      it('should handle URL pattern matching case insensitively', () => {
        const result = (selectiveInterceptor as any).matchesUrlPattern(
          'https://EXAMPLE.COM/API/users',  // uppercase
          '*/api/*'  // lowercase pattern
        );

        expect(result).toBe(true);
      });
    });
  });

  // EXISTING STREAMING-ONLY MODE TESTS
  describe('streaming-only mode', () => {
    let streamingOnlyInterceptor: RequestInterceptor;
    let mockRoute: any;

    beforeEach(() => {
      mockRoute = {
        continue: vi.fn(),
        abort: vi.fn()
      };

      streamingOnlyInterceptor = new RequestInterceptor(
        mockPage as any,
        [],
        { sessionId: 'test-session' },
        true, // streamingOnly = true
        [], // allowedUrls
        [] // blockedUrls
      );
    });

    it('should block non-streaming requests when streaming-only is enabled', async () => {
      const nonStreamingUrl = 'https://example.com/analytics/track';
      mockRequest.url.mockReturnValue(nonStreamingUrl);
      mockRequest.method.mockReturnValue('GET');

      await (streamingOnlyInterceptor as any).handleRequest(mockRoute, mockRequest);

      expect(mockRoute.abort).toHaveBeenCalledWith('blockedbyclient');
      expect(mockRoute.continue).not.toHaveBeenCalled();
      expect(streamingOnlyInterceptor.getBlockedRequestCount()).toBe(1);
    });

    it('should allow streaming requests when streaming-only is enabled', async () => {
      const streamingUrl = 'https://example.com/stream/playlist.m3u8';
      mockRequest.url.mockReturnValue(streamingUrl);
      mockRequest.method.mockReturnValue('GET');

      await (streamingOnlyInterceptor as any).handleRequest(mockRoute, mockRequest);

      expect(mockRoute.continue).toHaveBeenCalled();
      expect(mockRoute.abort).not.toHaveBeenCalled();
      expect(streamingOnlyInterceptor.getBlockedRequestCount()).toBe(0);
    });

    it('should allow essential requests when streaming-only is enabled', async () => {
      const essentialUrl = 'https://example.com/_next/static/chunks/main-abc123.js';
      mockRequest.url.mockReturnValue(essentialUrl);
      mockRequest.method.mockReturnValue('GET');

      await (streamingOnlyInterceptor as any).handleRequest(mockRoute, mockRequest);

      expect(mockRoute.continue).toHaveBeenCalled();
      expect(mockRoute.abort).not.toHaveBeenCalled();
      expect(streamingOnlyInterceptor.getBlockedRequestCount()).toBe(0);
    });

    it('should allow all requests when streaming-only is disabled', async () => {
      const regularInterceptor = new RequestInterceptor(
        mockPage as any,
        [],
        { sessionId: 'test-session' },
        false // streamingOnly = false
      );

      const nonStreamingUrl = 'https://example.com/analytics/track';
      mockRequest.url.mockReturnValue(nonStreamingUrl);
      mockRequest.method.mockReturnValue('GET');

      await (regularInterceptor as any).handleRequest(mockRoute, mockRequest);

      expect(mockRoute.continue).toHaveBeenCalled();
      expect(mockRoute.abort).not.toHaveBeenCalled();
      expect(regularInterceptor.getBlockedRequestCount()).toBe(0);
    });
  });

  describe('integration with selective targeting and streaming-only mode', () => {
    let hybridInterceptor: RequestInterceptor;
    let mockRoute: any;

    beforeEach(() => {
      mockRoute = {
        continue: vi.fn(),
        abort: vi.fn()
      };

      const hybridTemplates: ParameterTemplate[] = [
        {
          target: 'header',
          name: 'X-Streaming-Token',
          valueTemplate: 'stream_{{random:uuid}}',
          scope: 'per-session',
          urlPattern: '*.m3u8'
        },
        {
          target: 'header',
          name: 'X-API-Token',
          valueTemplate: 'api_{{sessionId}}',
          scope: 'per-session',
          urlPattern: '*/api/*'
        }
      ];

      hybridInterceptor = new RequestInterceptor(
        mockPage as any,
        hybridTemplates,
        { sessionId: 'test-session-123' },
        true, // streamingOnly = true
        ['*/api/essential/*'], // allowedUrls
        ['*analytics*'] // blockedUrls
      );
    });

    it('should apply selective parameters to allowed streaming requests', () => {
      const request = {
        url: 'https://cdn.example.com/playlist.m3u8',
        method: 'GET',
        headers: {},
        postData: undefined
      };

      const result = (hybridInterceptor as any).modifyRequest(request);

      expect(result.modified).toBe(true);
      expect(result.modifiedHeaders).toHaveProperty('X-Streaming-Token');
      expect(result.modifiedHeaders['X-Streaming-Token']).toMatch(/^stream_[a-f0-9-]+$/);
    });

    it('should apply selective parameters to allowed API requests', () => {
      const request = {
        url: 'https://example.com/api/essential/config',
        method: 'GET',
        headers: {},
        postData: undefined
      };

      const result = (hybridInterceptor as any).modifyRequest(request);

      expect(result.modified).toBe(true);
      expect(result.modifiedHeaders).toHaveProperty('X-API-Token');
      expect(result.modifiedHeaders['X-API-Token']).toBe('api_test-session-123');
    });

    it('should not apply parameters to blocked requests even if pattern matches', async () => {
      const blockedUrl = 'https://example.com/api/analytics/track';
      mockRequest.url.mockReturnValue(blockedUrl);
      mockRequest.method.mockReturnValue('GET');

      await (hybridInterceptor as any).handleRequest(mockRoute, mockRequest);

      expect(mockRoute.abort).toHaveBeenCalledWith('blockedbyclient');
      expect(mockRoute.continue).not.toHaveBeenCalled();
    });
  });

  describe('error handling in selective targeting', () => {
    let errorInterceptor: RequestInterceptor;

    beforeEach(() => {
      const errorTemplates: ParameterTemplate[] = [
        {
          target: 'header',
          name: 'X-Test',
          valueTemplate: '{{invalidVariable}}',
          scope: 'per-session',
          urlPattern: '*/api/*'
        }
      ];

      errorInterceptor = new RequestInterceptor(
        mockPage as any,
        errorTemplates,
        { sessionId: 'test-session' }
      );
    });

    it('should handle template errors gracefully and continue processing', () => {
      const request = {
        url: 'https://example.com/api/users',
        method: 'GET',
        headers: {},
        postData: undefined
      };

      const result = (errorInterceptor as any).modifyRequest(request);

      // Should still process the request even with template error
      expect(result.modified).toBe(true);
      expect(result.modifiedHeaders).toHaveProperty('X-Test', '{{invalidVariable}}');

      // Should log the error
      const errors = errorInterceptor.getErrors();
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should skip templates that do not match URL pattern', () => {
      const request = {
        url: 'https://example.com/static/image.jpg',
        method: 'GET',
        headers: {},
        postData: undefined
      };

      const result = (errorInterceptor as any).modifyRequest(request);

      expect(result.modified).toBe(false);
      expect(result.modifiedHeaders).toBeUndefined();
    });
  });

  describe('streaming-only mode', () => {
    let streamingOnlyInterceptor: RequestInterceptor;
    let mockRoute: any;

    beforeEach(() => {
      mockRoute = {
        continue: vi.fn(),
        abort: vi.fn()
      };

      streamingOnlyInterceptor = new RequestInterceptor(
        mockPage as any,
        [],
        { sessionId: 'test-session' },
        true, // streamingOnly = true
        [], // allowedUrls
        [] // blockedUrls
      );
    });

    it('should block non-streaming requests when streaming-only is enabled', async () => {
      const nonStreamingUrl = 'https://example.com/analytics/track';
      mockRequest.url.mockReturnValue(nonStreamingUrl);
      mockRequest.method.mockReturnValue('GET');

      await (streamingOnlyInterceptor as any).handleRequest(mockRoute, mockRequest);

      expect(mockRoute.abort).toHaveBeenCalledWith('blockedbyclient');
      expect(mockRoute.continue).not.toHaveBeenCalled();
      expect(streamingOnlyInterceptor.getBlockedRequestCount()).toBe(1);
    });
  });

  describe('URL filtering with allowedUrls', () => {
    let allowedUrlsInterceptor: RequestInterceptor;
    let mockRoute: any;

    beforeEach(() => {
      mockRoute = {
        continue: vi.fn(),
        abort: vi.fn()
      };

      allowedUrlsInterceptor = new RequestInterceptor(
        mockPage as any,
        [],
        { sessionId: 'test-session' },
        true, // streamingOnly = true
        ['*.css', '*fonts*', '/api/essential/'], // allowedUrls
        [] // blockedUrls
      );
    });

    it('should allow URLs matching allowedUrls patterns even in streaming-only mode', async () => {
      const allowedUrls = [
        'https://example.com/styles.css',
        'https://example.com/fonts/roboto.woff2',
        'https://example.com/api/essential/config'
      ];

      for (const url of allowedUrls) {
        mockRequest.url.mockReturnValue(url);
        mockRequest.method.mockReturnValue('GET');

        await (allowedUrlsInterceptor as any).handleRequest(mockRoute, mockRequest);

        expect(mockRoute.continue).toHaveBeenCalled();
        expect(mockRoute.abort).not.toHaveBeenCalled();
      }

      expect(allowedUrlsInterceptor.getBlockedRequestCount()).toBe(0);
    });

    it('should block non-streaming URLs that do not match allowedUrls patterns', async () => {
      const blockedUrl = 'https://example.com/analytics/track';
      mockRequest.url.mockReturnValue(blockedUrl);
      mockRequest.method.mockReturnValue('GET');

      await (allowedUrlsInterceptor as any).handleRequest(mockRoute, mockRequest);

      expect(mockRoute.abort).toHaveBeenCalledWith('blockedbyclient');
      expect(mockRoute.continue).not.toHaveBeenCalled();
      expect(allowedUrlsInterceptor.getBlockedRequestCount()).toBe(1);
    });
  });

  describe('URL filtering with blockedUrls', () => {
    let blockedUrlsInterceptor: RequestInterceptor;
    let mockRoute: any;

    beforeEach(() => {
      mockRoute = {
        continue: vi.fn(),
        abort: vi.fn()
      };

      blockedUrlsInterceptor = new RequestInterceptor(
        mockPage as any,
        [],
        { sessionId: 'test-session' },
        false, // streamingOnly = false
        [], // allowedUrls
        ['*analytics*', '*tracking*', '/ads/'] // blockedUrls
      );
    });

    it('should block URLs matching blockedUrls patterns even if they are streaming-related', async () => {
      const blockedUrls = [
        'https://analytics.example.com/stream/track',
        'https://example.com/tracking/player',
        'https://example.com/ads/video'
      ];

      for (const url of blockedUrls) {
        mockRequest.url.mockReturnValue(url);
        mockRequest.method.mockReturnValue('GET');

        await (blockedUrlsInterceptor as any).handleRequest(mockRoute, mockRequest);

        expect(mockRoute.abort).toHaveBeenCalledWith('blockedbyclient');
        expect(mockRoute.continue).not.toHaveBeenCalled();
      }

      expect(blockedUrlsInterceptor.getBlockedRequestCount()).toBe(3);
    });

    it('should allow URLs that do not match blockedUrls patterns', async () => {
      const allowedUrl = 'https://example.com/stream/playlist.m3u8';
      mockRequest.url.mockReturnValue(allowedUrl);
      mockRequest.method.mockReturnValue('GET');

      await (blockedUrlsInterceptor as any).handleRequest(mockRoute, mockRequest);

      expect(mockRoute.continue).toHaveBeenCalled();
      expect(mockRoute.abort).not.toHaveBeenCalled();
      expect(blockedUrlsInterceptor.getBlockedRequestCount()).toBe(0);
    });
  });

  describe('combined URL filtering', () => {
    let combinedInterceptor: RequestInterceptor;
    let mockRoute: any;

    beforeEach(() => {
      mockRoute = {
        continue: vi.fn(),
        abort: vi.fn()
      };

      combinedInterceptor = new RequestInterceptor(
        mockPage as any,
        [],
        { sessionId: 'test-session' },
        true, // streamingOnly = true
        ['*.css', '*fonts*'], // allowedUrls
        ['*analytics*', '*tracking*'] // blockedUrls
      );
    });

    it('should prioritize blockedUrls over allowedUrls', async () => {
      // URL that matches both allowed and blocked patterns
      const conflictUrl = 'https://analytics.example.com/styles.css';
      mockRequest.url.mockReturnValue(conflictUrl);
      mockRequest.method.mockReturnValue('GET');

      await (combinedInterceptor as any).handleRequest(mockRoute, mockRequest);

      // Should be blocked because blockedUrls has higher priority
      expect(mockRoute.abort).toHaveBeenCalledWith('blockedbyclient');
      expect(mockRoute.continue).not.toHaveBeenCalled();
      expect(combinedInterceptor.getBlockedRequestCount()).toBe(1);
    });

    it('should allow URLs matching allowedUrls but not blockedUrls', async () => {
      const allowedUrl = 'https://example.com/fonts/roboto.woff2';
      mockRequest.url.mockReturnValue(allowedUrl);
      mockRequest.method.mockReturnValue('GET');

      await (combinedInterceptor as any).handleRequest(mockRoute, mockRequest);

      expect(mockRoute.continue).toHaveBeenCalled();
      expect(mockRoute.abort).not.toHaveBeenCalled();
      expect(combinedInterceptor.getBlockedRequestCount()).toBe(0);
    });

    it('should block non-streaming URLs that match neither allowed nor blocked patterns', async () => {
      const regularUrl = 'https://example.com/api/user';
      mockRequest.url.mockReturnValue(regularUrl);
      mockRequest.method.mockReturnValue('GET');

      await (combinedInterceptor as any).handleRequest(mockRoute, mockRequest);

      // Should be blocked by streaming-only mode
      expect(mockRoute.abort).toHaveBeenCalledWith('blockedbyclient');
      expect(mockRoute.continue).not.toHaveBeenCalled();
      expect(combinedInterceptor.getBlockedRequestCount()).toBe(1);
    });
  });

  describe('URL pattern matching', () => {
    it('should match wildcard patterns correctly', () => {
      const testCases = [
        { url: 'https://example.com/styles.css', pattern: '*.css', expected: true },
        { url: 'https://example.com/app.js', pattern: '*.css', expected: false },
        { url: 'https://fonts.example.com/roboto.woff2', pattern: '*fonts*', expected: true },
        { url: 'https://example.com/images/logo.png', pattern: '*fonts*', expected: false },
        { url: 'https://example.com/anything', pattern: '*', expected: true }
      ];

      testCases.forEach(({ url, pattern, expected }) => {
        const result = (interceptor as any).matchesUrlPattern(url, pattern);
        expect(result).toBe(expected);
      });
    });

    it('should match regex patterns correctly', () => {
      const testCases = [
        { url: 'https://example.com/styles.css', pattern: '/.*\\.css$/', expected: true },
        { url: 'https://example.com/app.js', pattern: '/.*\\.css$/', expected: false },
        { url: 'https://api.example.com/v1/data', pattern: '/^https:\\/\\/api\\./', expected: true },
        { url: 'https://web.example.com/v1/data', pattern: '/^https:\\/\\/api\\./', expected: false }
      ];

      testCases.forEach(({ url, pattern, expected }) => {
        const result = (interceptor as any).matchesUrlPattern(url, pattern);
        expect(result).toBe(expected);
      });
    });

    it('should handle invalid regex patterns gracefully', () => {
      const url = 'https://example.com/test';
      const invalidPattern = '/[invalid regex/';

      const result = (interceptor as any).matchesUrlPattern(url, invalidPattern);

      // Should fall back to substring matching
      expect(result).toBe(false);

      // Should log an error
      const errors = interceptor.getErrors();
      expect(errors.some(error => error.message === 'Invalid URL pattern')).toBe(true);
    });

    it('should perform case-insensitive matching', () => {
      const testCases = [
        { url: 'https://EXAMPLE.com/STYLES.CSS', pattern: '*.css', expected: true },
        { url: 'https://example.com/fonts/ROBOTO.woff2', pattern: '*fonts*', expected: true },
        { url: 'https://ANALYTICS.example.com/track', pattern: '*analytics*', expected: true }
      ];

      testCases.forEach(({ url, pattern, expected }) => {
        const result = (interceptor as any).matchesUrlPattern(url, pattern);
        expect(result).toBe(expected);
      });
    });
  });

  describe('essential request detection', () => {
    it('should identify essential JavaScript and CSS files', () => {
      const essentialUrls = [
        'https://example.com/_next/static/chunks/main-abc123.js',
        'https://example.com/_next/static/chunks/framework-def456.js',
        'https://example.com/_next/static/chunks/webpack-ghi789.js',
        'https://example.com/_next/static/chunks/pages/_app-jkl012.js',
        'https://example.com/_next/static/css/styles.css'
      ];

      essentialUrls.forEach(url => {
        const isEssential = (interceptor as any).isEssentialRequest(url);
        expect(isEssential).toBe(true);
      });
    });

    it('should identify authentication and session management URLs', () => {
      const authUrls = [
        'https://example.com/api/auth/login',
        'https://example.com/api/auth/session',
        'https://example.com/session/validate'
      ];

      authUrls.forEach(url => {
        const isEssential = (interceptor as any).isEssentialRequest(url);
        expect(isEssential).toBe(true);
      });
    });

    it('should identify essential streaming setup URLs', () => {
      const streamingSetupUrls = [
        'https://example.com/api/domain/player-token?id=123',
        'https://example.com/stream-link/get'
      ];

      streamingSetupUrls.forEach(url => {
        const isEssential = (interceptor as any).isEssentialRequest(url);
        expect(isEssential).toBe(true);
      });
    });

    it('should not identify regular URLs as essential', () => {
      const regularUrls = [
        'https://example.com/api/user/profile',
        'https://example.com/images/banner.jpg',
        'https://analytics.example.com/track'
      ];

      regularUrls.forEach(url => {
        const isEssential = (interceptor as any).isEssentialRequest(url);
        expect(isEssential).toBe(false);
      });
    });
  });

  describe('blocked request counting', () => {
    let blockingInterceptor: RequestInterceptor;
    let mockRoute: any;

    beforeEach(() => {
      mockRoute = {
        continue: vi.fn(),
        abort: vi.fn()
      };

      blockingInterceptor = new RequestInterceptor(
        mockPage as any,
        [],
        { sessionId: 'test-session' },
        true, // streamingOnly = true
        [], // allowedUrls
        ['*analytics*'] // blockedUrls
      );
    });

    it('should increment blocked request count for streaming-only blocks', async () => {
      const nonStreamingUrl = 'https://example.com/api/user';
      mockRequest.url.mockReturnValue(nonStreamingUrl);
      mockRequest.method.mockReturnValue('GET');

      await (blockingInterceptor as any).handleRequest(mockRoute, mockRequest);

      expect(blockingInterceptor.getBlockedRequestCount()).toBe(1);
    });

    it('should increment blocked request count for blocked URLs', async () => {
      const blockedUrl = 'https://analytics.example.com/track';
      mockRequest.url.mockReturnValue(blockedUrl);
      mockRequest.method.mockReturnValue('GET');

      await (blockingInterceptor as any).handleRequest(mockRoute, mockRequest);

      expect(blockingInterceptor.getBlockedRequestCount()).toBe(1);
    });

    it('should accumulate blocked request count across multiple requests', async () => {
      const blockedUrls = [
        'https://example.com/api/user',
        'https://analytics.example.com/track',
        'https://example.com/images/banner.jpg'
      ];

      for (const url of blockedUrls) {
        mockRequest.url.mockReturnValue(url);
        mockRequest.method.mockReturnValue('GET');
        await (blockingInterceptor as any).handleRequest(mockRoute, mockRequest);
      }

      expect(blockingInterceptor.getBlockedRequestCount()).toBe(3);
    });

    it('should not increment count for allowed requests', async () => {
      const allowedUrl = 'https://example.com/stream/playlist.m3u8';
      mockRequest.url.mockReturnValue(allowedUrl);
      mockRequest.method.mockReturnValue('GET');

      await (blockingInterceptor as any).handleRequest(mockRoute, mockRequest);

      expect(blockingInterceptor.getBlockedRequestCount()).toBe(0);
    });
  });

  describe('manual response time calculation', () => {
    beforeEach(() => {
      // Mock Date.now to control timing
      let currentTime = 1000000;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        currentTime += 100; // Advance by 100ms each call
        return currentTime;
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should use manual timing when Playwright timing is not available', () => {
      mockRequest.url.mockReturnValue('https://example.com/api/test');
      mockRequest.method.mockReturnValue('GET');
      mockRequest.timing.mockReturnValue(null); // No Playwright timing
      mockResponse.status.mockReturnValue(200);

      // Simulate request start time being stored
      (mockRequest as any)._startTime = 1000000;

      (interceptor as any).collectNetworkMetrics(mockResponse);

      const metrics = interceptor.getNetworkMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].responseTime).toBeGreaterThan(0);
    });

    it('should fall back to 0 when no timing data is available', () => {
      mockRequest.url.mockReturnValue('https://example.com/api/test');
      mockRequest.method.mockReturnValue('GET');
      mockRequest.timing.mockReturnValue(null);
      mockResponse.status.mockReturnValue(200);

      // No start time stored
      delete (mockRequest as any)._startTime;

      (interceptor as any).collectNetworkMetrics(mockResponse);

      const metrics = interceptor.getNetworkMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].responseTime).toBe(0);
    });
  });

  describe('constructor parameter validation', () => {
    it('should initialize with all parameters provided', () => {
      const fullInterceptor = new RequestInterceptor(
        mockPage as any,
        parameterTemplates,
        { sessionId: 'test-session' },
        true, // streamingOnly
        ['*.css'], // allowedUrls
        ['*analytics*'] // blockedUrls
      );

      expect(fullInterceptor).toBeDefined();
      expect(fullInterceptor.getBlockedRequestCount()).toBe(0);
    });

    it('should initialize with minimal parameters', () => {
      const minimalInterceptor = new RequestInterceptor(mockPage as any);

      expect(minimalInterceptor).toBeDefined();
      expect(minimalInterceptor.getBlockedRequestCount()).toBe(0);
    });

    it('should handle empty URL arrays', () => {
      const emptyArraysInterceptor = new RequestInterceptor(
        mockPage as any,
        [],
        {},
        false,
        [], // empty allowedUrls
        [] // empty blockedUrls
      );

      expect(emptyArraysInterceptor).toBeDefined();
      expect(emptyArraysInterceptor.getBlockedRequestCount()).toBe(0);
    });
  });
});