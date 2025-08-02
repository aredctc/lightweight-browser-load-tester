import { Page, Request, Response } from 'playwright';
import { ParameterTemplate, NetworkMetrics, ErrorLog, StreamingMetrics, StreamingError } from '../types';
import { RandomizationUtil } from '../utils/randomization';

/**
 * Variable context for parameter template substitution
 */
export interface VariableContext {
    sessionId: string;
    timestamp: number;
    requestCount: number;
    [key: string]: any;
}

/**
 * Cache for file-based random data to avoid repeated file reads
 */
interface FileDataCache {
    [filePath: string]: {
        data: string[];
        lastModified: number;
    };
}

/**
 * Intercepted request data for modification
 */
export interface InterceptedRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    postData?: string;
}

/**
 * Request interception result
 */
export interface InterceptionResult {
    modified: boolean;
    originalUrl: string;
    modifiedUrl?: string;
    originalHeaders: Record<string, string>;
    modifiedHeaders?: Record<string, string>;
    originalPostData?: string;
    modifiedPostData?: string;
}

/**
 * Network request interceptor that modifies requests based on parameter templates
 */
export class RequestInterceptor {
    private page: Page;
    private parameterTemplates: ParameterTemplate[];
    private variableContext: VariableContext;
    private networkMetrics: NetworkMetrics[] = [];
    private errors: ErrorLog[] = [];
    private streamingErrors: StreamingError[] = [];
    private requestCount = 0;
    private streamingStartTime: number = 0;
    private streamingOnly: boolean = false;
    private blockedRequestCount = 0;
    private allowedUrls: string[] = [];
    private blockedUrls: string[] = [];
    private fileDataCache: FileDataCache = {};
    private randomizationUtil: RandomizationUtil;

    constructor(
        page: Page,
        parameterTemplates: ParameterTemplate[] = [],
        initialContext: Partial<VariableContext> = {},
        streamingOnly: boolean = false,
        allowedUrls: string[] = [],
        blockedUrls: string[] = []
    ) {
        this.page = page;
        this.parameterTemplates = parameterTemplates;
        this.streamingOnly = streamingOnly;
        this.allowedUrls = allowedUrls;
        this.blockedUrls = blockedUrls;
        this.variableContext = {
            sessionId: `session_${Date.now()}`,
            timestamp: Date.now(),
            requestCount: 0,
            ...initialContext
        };
        
        // Initialize randomization utility with context
        this.randomizationUtil = new RandomizationUtil(this.variableContext);
    }

    /**
     * Start intercepting network requests
     */
    async startInterception(): Promise<void> {
        try {
            // Enable request interception
            await this.page.route('**/*', async (route, request) => {
                await this.handleRequest(route, request);
            });

            // Listen for response events to collect metrics
            this.page.on('response', (response) => {
                this.collectNetworkMetrics(response);
            });

            // Listen for request failures
            this.page.on('requestfailed', (request) => {
                this.logRequestFailure(request);
            });

        } catch (error) {
            this.logError('Failed to start request interception', error);
            throw error;
        }
    }

    /**
     * Stop intercepting network requests
     */
    async stopInterception(): Promise<void> {
        try {
            // Remove all route handlers
            await this.page.unroute('**/*');
        } catch (error) {
            this.logError('Failed to stop request interception', error);
        }
    }

    /**
     * Update variable context for parameter substitution
     */
    updateContext(updates: Partial<VariableContext>): void {
        this.variableContext = {
            ...this.variableContext,
            ...updates,
            timestamp: Date.now()
        };
    }

    /**
     * Get collected network metrics
     */
    getNetworkMetrics(): NetworkMetrics[] {
        return [...this.networkMetrics];
    }

    /**
     * Get collected errors
     */
    getErrors(): ErrorLog[] {
        return [...this.errors];
    }

    /**
     * Get streaming-specific errors
     */
    getStreamingErrors(): StreamingError[] {
        return [...this.streamingErrors];
    }

    /**
     * Get the number of blocked requests (when streamingOnly is enabled)
     */
    getBlockedRequestCount(): number {
        return this.blockedRequestCount;
    }

    /**
     * Get aggregated streaming metrics
     */
    getStreamingMetrics(): StreamingMetrics {
        const streamingRequests = this.networkMetrics.filter(m => m.isStreamingRelated);

        const manifestRequests = streamingRequests.filter(m => m.streamingType === 'manifest');
        const segmentRequests = streamingRequests.filter(m => m.streamingType === 'segment');
        const licenseRequests = streamingRequests.filter(m => m.streamingType === 'license');
        const apiRequests = streamingRequests.filter(m => m.streamingType === 'api');

        const successfulRequests = streamingRequests.filter(m => m.statusCode >= 200 && m.statusCode < 400);
        const totalBytes = streamingRequests.reduce((sum, m) => sum + m.requestSize + m.responseSize, 0);
        const testDuration = this.streamingStartTime > 0 ? (Date.now() - this.streamingStartTime) / 1000 : 1;

        return {
            manifestRequests: manifestRequests.length,
            segmentRequests: segmentRequests.length,
            licenseRequests: licenseRequests.length,
            apiRequests: apiRequests.length,
            totalStreamingRequests: streamingRequests.length,
            averageManifestTime: this.calculateAverageResponseTime(manifestRequests),
            averageSegmentTime: this.calculateAverageResponseTime(segmentRequests),
            averageLicenseTime: this.calculateAverageResponseTime(licenseRequests),
            streamingSuccessRate: streamingRequests.length > 0 ? (successfulRequests.length / streamingRequests.length) * 100 : 0,
            bandwidthUsage: totalBytes / testDuration,
            errors: [...this.streamingErrors]
        };
    }

    /**
     * Start streaming monitoring (marks the beginning of streaming test)
     */
    startStreamingMonitoring(): void {
        this.streamingStartTime = Date.now();
    }

    /**
     * Clear collected metrics and errors
     */
    clearMetrics(): void {
        this.networkMetrics = [];
        this.errors = [];
        this.streamingErrors = [];
        this.requestCount = 0;
        this.streamingStartTime = 0;
    }

    /**
     * Handle intercepted request
     */
    private async handleRequest(route: any, request: Request): Promise<void> {
        try {
            this.requestCount++;
            this.variableContext.requestCount = this.requestCount;

            const url = request.url();

            // Priority 1: Check if URL is explicitly blocked (highest priority)
            if (this.isBlockedUrl(url)) {
                this.blockedRequestCount++;
                await route.abort('blockedbyclient');
                return;
            }

            // Priority 2: Check if URL is explicitly allowed (overrides streaming-only mode)
            if (this.isAllowedUrl(url)) {
                // Allow the request to continue (skip streaming-only check)
            }
            // Priority 3: Apply streaming-only logic if not explicitly allowed
            else if (this.streamingOnly && !this.isStreamingRequest(url) && !this.isEssentialRequest(url)) {
                this.blockedRequestCount++;
                await route.abort('blockedbyclient');
                return;
            }

            // Store request start time for manual timing calculation
            const requestStartTime = Date.now();

            // Store timing info for this request
            (request as any)._startTime = requestStartTime;

            const interceptedRequest: InterceptedRequest = {
                url,
                method: request.method(),
                headers: request.headers(),
                postData: request.postData() || undefined
            };

            const result = this.modifyRequest(interceptedRequest);

            if (result.modified) {
                // Continue with modified request
                const modifiedOptions: any = {};

                if (result.modifiedUrl && result.modifiedUrl !== result.originalUrl) {
                    modifiedOptions.url = result.modifiedUrl;
                }

                if (result.modifiedHeaders) {
                    modifiedOptions.headers = result.modifiedHeaders;
                }

                if (result.modifiedPostData !== undefined) {
                    modifiedOptions.postData = result.modifiedPostData;
                }

                await route.continue(modifiedOptions);
            } else {
                // Continue with original request
                await route.continue();
            }

        } catch (error) {
            this.logError('Failed to handle intercepted request', error, {
                url: request.url(),
                method: request.method()
            });

            // Continue with original request on error
            try {
                await route.continue();
            } catch (continueError) {
                this.logError('Failed to continue request after error', continueError);
            }
        }
    }

    /**
     * Modify request based on parameter templates
     */
    private modifyRequest(request: InterceptedRequest): InterceptionResult {
        const result: InterceptionResult = {
            modified: false,
            originalUrl: request.url,
            originalHeaders: { ...request.headers },
            originalPostData: request.postData
        };

        let modifiedUrl = request.url;
        let modifiedHeaders = { ...request.headers };
        let modifiedPostData = request.postData;

        for (const template of this.parameterTemplates) {
            try {
                // Check if template should be applied to this request
                if (!this.shouldApplyTemplate(template, request.url, request.method)) {
                    continue;
                }

                const value = this.substituteVariables(template.valueTemplate);

                switch (template.target) {
                    case 'header':
                        modifiedHeaders[template.name] = value;
                        result.modified = true;
                        break;

                    case 'query':
                        modifiedUrl = this.addQueryParameter(modifiedUrl, template.name, value);
                        result.modified = true;
                        break;

                    case 'body':
                        if (modifiedPostData) {
                            modifiedPostData = this.modifyRequestBody(modifiedPostData, template.name, value);
                            result.modified = true;
                        }
                        break;
                }
            } catch (error) {
                this.logError('Failed to apply parameter template', error, {
                    template: template.name,
                    target: template.target,
                    url: request.url,
                    method: request.method
                });
            }
        }

        if (result.modified) {
            result.modifiedUrl = modifiedUrl;
            result.modifiedHeaders = modifiedHeaders;
            result.modifiedPostData = modifiedPostData;
        }

        return result;
    }

    /**
     * Substitute variables in template string with support for random functions
     */
    private substituteVariables(template: string): string {
        try {
            // Update randomization utility context with current variable context
            this.randomizationUtil.updateContext(this.variableContext);
            
            // Use shared randomization utility
            const result = this.randomizationUtil.substituteVariables(template);
            
            // Check if any substitution failed (indicated by unchanged template with error patterns)
            if (result.includes('randomFromFile:') && result.includes('/nonexistent/')) {
                this.logError('Failed to load file data', new Error('File not found'), { template, result });
            }
            
            // Check if template contains unresolved variables (still has {{ }} after substitution)
            if (result !== template && result.includes('{{') && result.includes('}}')) {
                this.logError('Template contains unresolved variables', new Error('Variable substitution incomplete'), { template, result });
            } else if (result === template && template.includes('{{') && template.includes('}}')) {
                // If result is unchanged and contains template variables, it means substitution failed
                this.logError('Failed to substitute template variables', new Error('Unknown variables or functions'), { template });
            }
            
            return result;
        } catch (error) {
            this.logError('Failed to substitute variables', error, { template });
            return template;
        }
    }



    /**
     * Add query parameter to URL
     */
    private addQueryParameter(url: string, name: string, value: string): string {
        try {
            const urlObj = new URL(url);
            urlObj.searchParams.set(name, value);
            return urlObj.toString();
        } catch (error) {
            this.logError('Failed to add query parameter', error, { url, name, value });
            return url;
        }
    }

    /**
     * Modify request body (supports JSON and form data)
     */
    private modifyRequestBody(postData: string, name: string, value: string): string {
        // Handle empty body
        if (!postData || postData.trim() === '') {
            this.logError('Unable to modify empty request body', null, {
                postData: postData
            });
            return postData;
        }

        try {
            // Try to parse as JSON
            const jsonData = JSON.parse(postData);
            
            // Try to parse the value as JSON if it looks like JSON
            let parsedValue = value;
            if (typeof value === 'string' && value.trim().startsWith('{') && value.trim().endsWith('}')) {
                try {
                    parsedValue = JSON.parse(value);
                } catch {
                    // If parsing fails, use the original string value
                    parsedValue = value;
                }
            }
            
            jsonData[name] = parsedValue;
            return JSON.stringify(jsonData);
        } catch {
            // If not JSON, check if it looks like form data
            if (this.isFormData(postData)) {
                try {
                    const params = new URLSearchParams(postData);
                    params.set(name, value);
                    return params.toString();
                } catch {
                    // If URLSearchParams fails, return original
                    this.logError('Unable to modify form data request body', null, {
                        postData: postData.substring(0, 100) + '...'
                    });
                    return postData;
                }
            } else {
                // If neither JSON nor form data, return original
                this.logError('Unable to modify request body - unsupported format', null, {
                    postData: postData.substring(0, 100) + '...'
                });
                return postData;
            }
        }
    }

    /**
     * Check if string looks like form data
     */
    private isFormData(data: string): boolean {
        // Basic heuristic: form data typically contains = and & characters
        // and doesn't contain spaces (unless URL encoded)
        return /^[^=]*=[^&]*(&[^=]*=[^&]*)*$/.test(data) ||
            /^[a-zA-Z0-9%._~:/?#[\]@!$&'()*+,;=-]*$/.test(data);
    }

    /**
     * Collect network metrics from response
     */
    private collectNetworkMetrics(response: Response): void {
        try {
            const request = response.request();
            const timing = response.request().timing();
            const url = request.url();
            const responseEndTime = Date.now();

            // Calculate response time using manual timing (more reliable than Playwright timing)
            let responseTime = 0;
            const requestStartTime = (request as any)._startTime;
            if (requestStartTime) {
                responseTime = responseEndTime - requestStartTime;
            } else if (timing && timing.requestStart && timing.responseEnd) {
                // Fallback to Playwright timing if manual timing is not available
                responseTime = timing.responseEnd - timing.requestStart;
            }

            const metric: NetworkMetrics = {
                url,
                method: request.method(),
                responseTime,
                statusCode: response.status(),
                timestamp: new Date(),
                requestSize: this.calculateRequestSize(request),
                responseSize: this.calculateResponseSize(response),
                isStreamingRelated: this.isStreamingRequest(url),
                streamingType: this.getStreamingType(url)
            };

            this.networkMetrics.push(metric);

            // Log streaming-specific errors
            if (metric.isStreamingRelated && (response.status() >= 400 || response.status() === 0)) {
                this.logStreamingError(url, response.status(), 'network', `HTTP ${response.status()}`);
            }
        } catch (error) {
            this.logError('Failed to collect network metrics', error);
        }
    }

    /**
     * Calculate approximate request size
     */
    private calculateRequestSize(request: Request): number {
        try {
            let size = request.url().length;

            // Add headers size
            const headers = request.headers();
            for (const [key, value] of Object.entries(headers)) {
                size += key.length + value.length + 4; // +4 for ": " and "\r\n"
            }

            // Add post data size
            const postData = request.postData();
            if (postData) {
                size += postData.length;
            }

            return size;
        } catch {
            return 0;
        }
    }

    /**
     * Log request failure
     */
    private logRequestFailure(request: Request): void {
        this.logError('Request failed', null, {
            url: request.url(),
            method: request.method(),
            failure: request.failure()?.errorText || 'Unknown error'
        });
    }

    /**
     * Calculate approximate response size
     */
    private calculateResponseSize(response: Response): number {
        try {
            // Try to get content-length header
            const contentLength = response.headers()['content-length'];
            if (contentLength) {
                return parseInt(contentLength, 10);
            }

            // If no content-length, estimate based on headers
            let size = 0;
            const headers = response.headers();
            for (const [key, value] of Object.entries(headers)) {
                size += key.length + value.length + 4; // +4 for ": " and "\r\n"
            }

            return size;
        } catch {
            return 0;
        }
    }

    /**
     * Check if request is streaming-related
     */
    private isStreamingRequest(url: string): boolean {
        const streamingPatterns = [
            // Manifest files
            /\.m3u8(\?|$)/i,
            /\.mpd(\?|$)/i,
            /manifest/i,

            // Media segments
            /\.ts(\?|$)/i,
            /\.m4s(\?|$)/i,
            /\.mp4(\?|$)/i,
            /segment/i,
            /chunk/i,

            // DRM/License requests
            /license/i,
            /drm/i,
            /widevine/i,
            /playready/i,
            /fairplay/i,

            // Streaming APIs
            /api.*stream/i,
            /stream.*api/i,
            /playback/i,
            /player/i
        ];

        return streamingPatterns.some(pattern => pattern.test(url));
    }

    /**
     * Check if request is essential for page functionality (should not be blocked even in streaming-only mode)
     */
    private isEssentialRequest(url: string): boolean {
        const essentialPatterns = [
            // Main page document
            /^https?:\/\/[^/]+\/?$/,
            /\/live\?/i,
            /\/start\/?$/i,

            // Essential JavaScript and CSS for page functionality
            /\/_next\/static\/chunks\/main-/i,
            /\/_next\/static\/chunks\/framework-/i,
            /\/_next\/static\/chunks\/webpack-/i,
            /\/_next\/static\/chunks\/pages\/_app-/i,
            /\/_next\/static\/css\//i,

            // Authentication and session management
            /\/api\/auth\//i,
            /\/session/i,

            // Essential data for streaming setup
            /\/api\/domain\/player-token/i,
            /\/stream-link/i,

            // Document resources (HTML, main page data)
            /\/_next\/data\//i,
            /\.html(\?|$)/i,

            // Favicon and essential icons
            /favicon\.ico/i,
            /\/icon-/i
        ];

        return essentialPatterns.some(pattern => pattern.test(url));
    }

    /**
     * Check if URL matches any of the allowed URL patterns
     */
    private isAllowedUrl(url: string): boolean {
        if (this.allowedUrls.length === 0) {
            return false;
        }
        return this.allowedUrls.some(pattern => this.matchesUrlPattern(url, pattern));
    }

    /**
     * Check if URL matches any of the blocked URL patterns
     */
    private isBlockedUrl(url: string): boolean {
        if (this.blockedUrls.length === 0) {
            return false;
        }
        return this.blockedUrls.some(pattern => this.matchesUrlPattern(url, pattern));
    }

    /**
     * Check if URL matches a pattern (supports wildcards and regex-like patterns)
     */
    private matchesUrlPattern(url: string, pattern: string): boolean {
        try {
            // If pattern starts and ends with /, treat as regex
            if (pattern.startsWith('/') && pattern.endsWith('/')) {
                const regexPattern = pattern.slice(1, -1);
                const regex = new RegExp(regexPattern, 'i');
                return regex.test(url);
            }

            // Convert glob-like pattern to regex
            // Escape special regex characters except * and ?
            const escapedPattern = pattern
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.');

            const regex = new RegExp(`^${escapedPattern}$`, 'i');
            return regex.test(url);
        } catch (error) {
            // If pattern is invalid, fall back to simple string matching
            this.logError('Invalid URL pattern', error, { pattern, url });
            return url.toLowerCase().includes(pattern.toLowerCase());
        }
    }

    /**
     * Check if a parameter template should be applied to a specific request
     */
    private shouldApplyTemplate(template: ParameterTemplate, url: string, method: string): boolean {
        // Check URL pattern if specified
        if (template.urlPattern) {
            if (!this.matchesUrlPattern(url, template.urlPattern)) {
                return false;
            }
        }

        // Check HTTP method if specified
        if (template.method) {
            if (method.toLowerCase() !== template.method.toLowerCase()) {
                return false;
            }
        }

        // If no filters specified, or all filters match, apply the template
        return true;
    }

    /**
     * Determine streaming request type
     */
    private getStreamingType(url: string): 'manifest' | 'segment' | 'license' | 'api' | 'other' | undefined {
        if (!this.isStreamingRequest(url)) {
            return undefined;
        }

        // Manifest files
        if (/\.m3u8(\?|$)|\.mpd(\?|$)|manifest/i.test(url)) {
            return 'manifest';
        }

        // Media segments
        if (/\.ts(\?|$)|\.m4s(\?|$)|\.mp4(\?|$)|segment|chunk/i.test(url)) {
            return 'segment';
        }

        // DRM/License requests
        if (/license|drm|widevine|playready|fairplay/i.test(url)) {
            return 'license';
        }

        // Streaming APIs
        if (/api.*stream|stream.*api|playback|player/i.test(url)) {
            return 'api';
        }

        return 'other';
    }

    /**
     * Calculate average response time for a set of metrics
     */
    private calculateAverageResponseTime(metrics: NetworkMetrics[]): number {
        if (metrics.length === 0) {
            return 0;
        }

        const totalTime = metrics.reduce((sum, metric) => sum + metric.responseTime, 0);
        return totalTime / metrics.length;
    }

    /**
     * Log streaming-specific error
     */
    private logStreamingError(
        url: string,
        statusCode: number,
        errorType: StreamingError['errorType'],
        message: string,
        context?: Record<string, any>
    ): void {
        const streamingError: StreamingError = {
            timestamp: new Date(),
            errorType,
            errorCode: statusCode.toString(),
            errorMessage: message,
            url,
            context: {
                sessionId: this.variableContext.sessionId,
                requestCount: this.requestCount,
                ...context
            }
        };

        this.streamingErrors.push(streamingError);
    }

    /**
     * Log error with context
     */
    private logError(message: string, error: any, context?: Record<string, any>): void {
        const errorLog: ErrorLog = {
            timestamp: new Date(),
            level: 'error',
            message,
            stack: error?.stack,
            context: {
                sessionId: this.variableContext.sessionId,
                requestCount: this.requestCount,
                ...context
            }
        };

        this.errors.push(errorLog);
    }
}