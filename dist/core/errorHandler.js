"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = exports.InternalError = exports.APIError = exports.UserError = exports.ReviewError = exports.ExitCode = void 0;
const chalk_1 = __importDefault(require("chalk"));
var ExitCode;
(function (ExitCode) {
    ExitCode[ExitCode["SUCCESS"] = 0] = "SUCCESS";
    ExitCode[ExitCode["GENERAL_ERROR"] = 1] = "GENERAL_ERROR";
    ExitCode[ExitCode["FINDINGS_ABOVE_THRESHOLD"] = 2] = "FINDINGS_ABOVE_THRESHOLD";
    ExitCode[ExitCode["USER_ERROR"] = 3] = "USER_ERROR";
    ExitCode[ExitCode["API_ERROR"] = 4] = "API_ERROR";
    ExitCode[ExitCode["INTERNAL_ERROR"] = 5] = "INTERNAL_ERROR";
})(ExitCode || (exports.ExitCode = ExitCode = {}));
class ReviewError extends Error {
    code;
    context;
    isRetryable;
    constructor(message, code = ExitCode.GENERAL_ERROR, context, isRetryable = false) {
        super(message);
        this.name = 'ReviewError';
        this.code = code;
        this.context = context;
        this.isRetryable = isRetryable;
    }
}
exports.ReviewError = ReviewError;
class UserError extends ReviewError {
    constructor(message, context) {
        super(message, ExitCode.USER_ERROR, context, false);
        this.name = 'UserError';
    }
}
exports.UserError = UserError;
class APIError extends ReviewError {
    statusCode;
    response;
    constructor(message, statusCode, response, context, isRetryable = false) {
        super(message, ExitCode.API_ERROR, context, isRetryable);
        this.name = 'APIError';
        this.statusCode = statusCode;
        this.response = response;
    }
}
exports.APIError = APIError;
class InternalError extends ReviewError {
    constructor(message, context, cause) {
        super(message, ExitCode.INTERNAL_ERROR, context, false);
        this.name = 'InternalError';
        if (cause && cause.stack) {
            this.stack = `${this.stack || ''}\nCaused by: ${cause.stack}`;
        }
    }
}
exports.InternalError = InternalError;
class ErrorHandler {
    logger;
    errorCounts = new Map();
    constructor(logger) {
        this.logger = logger;
    }
    /**
     * Handle any error and determine appropriate exit code
     */
    async handle(error) {
        const reviewError = this.normalizeError(error);
        // Log error details
        await this.logError(reviewError);
        // Track error for analytics
        this.trackError(reviewError);
        // Exit with appropriate code
        process.exit(reviewError.code);
    }
    /**
     * Handle error without exiting (for recoverable errors)
     */
    async handleRecoverable(error) {
        const reviewError = this.normalizeError(error);
        // Log error details
        await this.logError(reviewError);
        // Track error for analytics
        this.trackError(reviewError);
        return reviewError;
    }
    /**
     * Create a user error
     */
    createUserError(message, context) {
        return new UserError(message, context);
    }
    /**
     * Create an API error
     */
    createAPIError(message, statusCode, response, context, isRetryable = false) {
        return new APIError(message, statusCode, response, context, isRetryable);
    }
    /**
     * Create an internal error
     */
    createInternalError(message, context, cause) {
        return new InternalError(message, context, cause);
    }
    /**
     * Create a ReviewError from any error
     */
    createFromError(error, message, context) {
        if (error instanceof ReviewError) {
            return error;
        }
        if (error instanceof Error) {
            const errorMessage = message || error.message;
            // Check for specific error types
            if (error.message.includes('ENOENT') || error.message.includes('not found')) {
                return new UserError(`File or resource not found: ${errorMessage}`, context);
            }
            if (error.message.includes('EACCES') || error.message.includes('permission denied')) {
                return new UserError(`Permission denied: ${errorMessage}`, context);
            }
            if (error.message.includes('ENOTDIR') || error.message.includes('not a directory')) {
                return new UserError(`Invalid directory: ${errorMessage}`, context);
            }
            // Network/API related errors
            if (error.message.includes('fetch') || error.message.includes('request')) {
                return new APIError(`Network request failed: ${errorMessage}`, undefined, undefined, context, true);
            }
            // Default to internal error
            return new InternalError(errorMessage, context, error);
        }
        // Handle non-Error objects
        const errorMessage = message || (typeof error === 'string' ? error : 'Unknown error occurred');
        return new InternalError(errorMessage, context);
    }
    /**
     * Check if error is retryable
     */
    isRetryable(error) {
        if (error instanceof ReviewError) {
            return error.isRetryable;
        }
        if (error instanceof Error) {
            // Network errors are generally retryable
            const networkErrors = ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'];
            return networkErrors.some(code => error.message.includes(code));
        }
        return false;
    }
    /**
     * Get error statistics
     */
    getErrorStats() {
        return Object.fromEntries(this.errorCounts);
    }
    /**
     * Reset error statistics
     */
    resetStats() {
        this.errorCounts.clear();
    }
    /**
     * Normalize any error to ReviewError
     */
    normalizeError(error) {
        if (error instanceof ReviewError) {
            return error;
        }
        if (error instanceof Error) {
            // Check for specific error types
            if (error.message.includes('ENOENT') || error.message.includes('not found')) {
                return new UserError(`File or resource not found: ${error.message}`);
            }
            if (error.message.includes('EACCES') || error.message.includes('permission denied')) {
                return new UserError(`Permission denied: ${error.message}`);
            }
            if (error.message.includes('ENOTDIR') || error.message.includes('not a directory')) {
                return new UserError(`Invalid directory: ${error.message}`);
            }
            // Network/API related errors
            if (error.message.includes('fetch') || error.message.includes('request')) {
                return new APIError(`Network request failed: ${error.message}`, undefined, undefined, undefined, true);
            }
            // Default to internal error
            return new InternalError(`Unexpected error: ${error.message}`, undefined, error);
        }
        // Handle non-Error objects
        const message = typeof error === 'string' ? error : 'Unknown error occurred';
        return new InternalError(message);
    }
    /**
     * Log error with appropriate level and formatting
     */
    async logError(error) {
        const errorInfo = this.formatErrorInfo(error);
        switch (error.code) {
            case ExitCode.USER_ERROR:
                this.logger.error(chalk_1.default.red(`❌ ${errorInfo.message}`));
                if (errorInfo.suggestion) {
                    this.logger.info(chalk_1.default.yellow(`💡 ${errorInfo.suggestion}`));
                }
                break;
            case ExitCode.API_ERROR:
                this.logger.error(chalk_1.default.red(`🌐 API Error: ${errorInfo.message}`));
                if (error instanceof APIError && error.statusCode !== undefined) {
                    this.logger.debug(`Status Code: ${error.statusCode}`);
                }
                if (error.isRetryable) {
                    this.logger.info(chalk_1.default.yellow('This error may be temporary. Consider retrying.'));
                }
                break;
            case ExitCode.INTERNAL_ERROR:
                this.logger.error(chalk_1.default.red(`🔧 Internal Error: ${errorInfo.message}`));
                if (error.stack) {
                    this.logger.debug(`Stack trace: ${error.stack}`);
                }
                break;
            default:
                this.logger.error(chalk_1.default.red(`Error: ${errorInfo.message}`));
        }
        // Log context if available
        if (error.context) {
            this.logger.debug(`Context: ${JSON.stringify(error.context, null, 2)}`);
        }
    }
    /**
     * Format error information for display
     */
    formatErrorInfo(error) {
        let message = error.message;
        let suggestion = undefined;
        // Add helpful suggestions for common errors
        if (error instanceof UserError) {
            if (error.message.includes('not found')) {
                suggestion = 'Please check the file path and ensure the file exists.';
            }
            else if (error.message.includes('permission')) {
                suggestion = 'Please check file permissions or run with appropriate privileges.';
            }
            else if (error.message.includes('PR')) {
                suggestion = 'Please verify the PR URL or ID and ensure you have access to the repository.';
            }
        }
        else if (error instanceof APIError) {
            if (error.statusCode === 401) {
                suggestion = 'Please check your authentication credentials.';
            }
            else if (error.statusCode === 403) {
                suggestion = 'Please ensure you have the necessary permissions for this operation.';
            }
            else if (error.statusCode === 404) {
                suggestion = 'Please verify the resource exists and the URL/ID is correct.';
            }
            else if (error.statusCode && error.statusCode >= 500) {
                suggestion = 'This appears to be a server error. Please try again later.';
            }
        }
        const result = { message };
        if (suggestion !== undefined) {
            result.suggestion = suggestion;
        }
        return result;
    }
    /**
     * Track error for analytics
     */
    trackError(error) {
        const errorType = error.constructor.name;
        const currentCount = this.errorCounts.get(errorType) || 0;
        this.errorCounts.set(errorType, currentCount + 1);
    }
    /**
     * Create error from HTTP response
     */
    createFromHttpResponse(response, context) {
        const isRetryable = response.status >= 500 || response.status === 429;
        const message = `HTTP ${response.status}: ${response.statusText}`;
        return new APIError(message, response.status, response.data, context, isRetryable);
    }
    /**
     * Wrap async operation with error handling
     */
    async withErrorHandling(operation, context) {
        try {
            return await operation();
        }
        catch (error) {
            const reviewError = this.normalizeError(error);
            if (context) {
                reviewError.context = { ...reviewError.context, ...context };
            }
            throw reviewError;
        }
    }
}
exports.ErrorHandler = ErrorHandler;
//# sourceMappingURL=errorHandler.js.map