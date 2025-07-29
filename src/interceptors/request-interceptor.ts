import { Page, Request, Response } from 'playwright';
import { ParameterTemplate, NetworkMetrics, ErrorLog, StreamingMetrics, StreamingError } from '../types';

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

    constructor(
        page: Page,
        parameterTemplates: ParameterTemplate[] = [],
        initialContext: Partial<VariableContext> = {}
    ) {
        this.page = page;
        this.parameterTemplates = parameterTemplates;
        this.variableContext = {
            sessionId: `session_${Date.now()}`,
            timestamp: Date.now(),
            requestCount: 0,
            ...initialContext
        };
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

            const interceptedRequest: InterceptedRequest = {
                url: request.url(),
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
                    target: template.target
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
     * Substitute variables in template string
     */
    private substituteVariables(template: string): string {
        return template.replace(/\{\{(\w+)\}\}/g, (match, variableName) => {
            const value = this.variableContext[variableName];
            return value !== undefined ? String(value) : match;
        });
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
            jsonData[name] = value;
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

            const metric: NetworkMetrics = {
                url,
                method: request.method(),
                responseTime: timing ? Math.max(0, timing.responseEnd - timing.requestStart) : 0,
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
            /player/i,
            
            // DAZN specific patterns
            /dazn.*stream/i,
            /dazn.*playback/i,
            /dazn.*manifest/i,
            /dazn.*license/i
        ];

        return streamingPatterns.some(pattern => pattern.test(url));
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