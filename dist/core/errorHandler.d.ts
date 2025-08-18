import { Logger } from './logger';
export declare enum ExitCode {
    SUCCESS = 0,
    GENERAL_ERROR = 1,
    FINDINGS_ABOVE_THRESHOLD = 2,
    USER_ERROR = 3,
    API_ERROR = 4,
    INTERNAL_ERROR = 5
}
export interface ErrorContext {
    operation?: string;
    component?: string;
    metadata?: Record<string, any>;
}
export declare class ReviewError extends Error {
    readonly code: ExitCode;
    context: ErrorContext | undefined;
    readonly isRetryable: boolean;
    constructor(message: string, code?: ExitCode, context?: ErrorContext, isRetryable?: boolean);
}
export declare class UserError extends ReviewError {
    constructor(message: string, context?: ErrorContext);
}
export declare class APIError extends ReviewError {
    readonly statusCode: number | undefined;
    readonly response?: any;
    constructor(message: string, statusCode?: number, response?: any, context?: ErrorContext, isRetryable?: boolean);
}
export declare class InternalError extends ReviewError {
    constructor(message: string, context?: ErrorContext, cause?: Error);
}
export declare class ErrorHandler {
    private logger;
    private errorCounts;
    constructor(logger: Logger);
    /**
     * Handle any error and determine appropriate exit code
     */
    handle(error: unknown): Promise<never>;
    /**
     * Handle error without exiting (for recoverable errors)
     */
    handleRecoverable(error: unknown): Promise<ReviewError>;
    /**
     * Create a user error
     */
    createUserError(message: string, context?: ErrorContext): UserError;
    /**
     * Create an API error
     */
    createAPIError(message: string, statusCode?: number, response?: any, context?: ErrorContext, isRetryable?: boolean): APIError;
    /**
     * Create an internal error
     */
    createInternalError(message: string, context?: ErrorContext, cause?: Error): InternalError;
    /**
     * Create a ReviewError from any error
     */
    createFromError(error: unknown, message?: string, context?: ErrorContext): ReviewError;
    /**
     * Check if error is retryable
     */
    isRetryable(error: unknown): boolean;
    /**
     * Get error statistics
     */
    getErrorStats(): Record<string, number>;
    /**
     * Reset error statistics
     */
    resetStats(): void;
    /**
     * Normalize any error to ReviewError
     */
    normalizeError(error: unknown): ReviewError;
    /**
     * Log error with appropriate level and formatting
     */
    private logError;
    /**
     * Format error information for display
     */
    private formatErrorInfo;
    /**
     * Track error for analytics
     */
    private trackError;
    /**
     * Create error from HTTP response
     */
    createFromHttpResponse(response: {
        status: number;
        statusText: string;
        data?: any;
    }, context?: ErrorContext): APIError;
    /**
     * Wrap async operation with error handling
     */
    withErrorHandling<T>(operation: () => Promise<T>, context?: ErrorContext): Promise<T>;
}
//# sourceMappingURL=errorHandler.d.ts.map