import { Logger } from './logger';
import chalk from 'chalk';

export enum ExitCode {
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

export class ReviewError extends Error {
  public readonly code: ExitCode;
  public context: ErrorContext | undefined;
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    code: ExitCode = ExitCode.GENERAL_ERROR,
    context?: ErrorContext,
    isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'ReviewError';
    this.code = code;
    this.context = context;
    this.isRetryable = isRetryable;
  }
}

export class UserError extends ReviewError {
  constructor(message: string, context?: ErrorContext) {
    super(message, ExitCode.USER_ERROR, context, false);
    this.name = 'UserError';
  }
}

export class APIError extends ReviewError {
  public readonly statusCode: number | undefined;
  public readonly response?: any;

  constructor(
    message: string,
    statusCode?: number,
    response?: any,
    context?: ErrorContext,
    isRetryable: boolean = false
  ) {
    super(message, ExitCode.API_ERROR, context, isRetryable);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

export class InternalError extends ReviewError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super(message, ExitCode.INTERNAL_ERROR, context, false);
    this.name = 'InternalError';
    if (cause && cause.stack) {
      this.stack = `${this.stack || ''}\nCaused by: ${cause.stack}`;
    }
  }
}

export class ErrorHandler {
  private logger: Logger;
  private errorCounts: Map<string, number> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Handle any error and determine appropriate exit code
   */
  public async handle(error: unknown): Promise<never> {
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
  public async handleRecoverable(error: unknown): Promise<ReviewError> {
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
  public createUserError(message: string, context?: ErrorContext): UserError {
    return new UserError(message, context);
  }

  /**
   * Create an API error
   */
  public createAPIError(
    message: string,
    statusCode?: number,
    response?: any,
    context?: ErrorContext,
    isRetryable: boolean = false
  ): APIError {
    return new APIError(message, statusCode, response, context, isRetryable);
  }

  /**
   * Create an internal error
   */
  public createInternalError(
    message: string,
    context?: ErrorContext,
    cause?: Error
  ): InternalError {
    return new InternalError(message, context, cause);
  }

  /**
   * Create a ReviewError from any error
   */
  public createFromError(
    error: unknown,
    message?: string,
    context?: ErrorContext
  ): ReviewError {
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
        return new APIError(
          `Network request failed: ${errorMessage}`,
          undefined,
          undefined,
          context,
          true
        );
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
  public isRetryable(error: unknown): boolean {
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
  public getErrorStats(): Record<string, number> {
    return Object.fromEntries(this.errorCounts);
  }

  /**
   * Reset error statistics
   */
  public resetStats(): void {
    this.errorCounts.clear();
  }

  /**
   * Normalize any error to ReviewError
   */
  public normalizeError(error: unknown): ReviewError {
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
        return new APIError(
          `Network request failed: ${error.message}`,
          undefined,
          undefined,
          undefined,
          true
        );
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
  private async logError(error: ReviewError): Promise<void> {
    const errorInfo = this.formatErrorInfo(error);
    
    switch (error.code) {
      case ExitCode.USER_ERROR:
        this.logger.error(chalk.red(`❌ ${errorInfo.message}`));
        if (errorInfo.suggestion) {
          this.logger.info(chalk.yellow(`💡 ${errorInfo.suggestion}`));
        }
        break;
        
      case ExitCode.API_ERROR:
        this.logger.error(chalk.red(`🌐 API Error: ${errorInfo.message}`));
        if (error instanceof APIError && error.statusCode !== undefined) {
          this.logger.debug(`Status Code: ${error.statusCode}`);
        }
        if (error.isRetryable) {
          this.logger.info(chalk.yellow('This error may be temporary. Consider retrying.'));
        }
        break;
        
      case ExitCode.INTERNAL_ERROR:
        this.logger.error(chalk.red(`🔧 Internal Error: ${errorInfo.message}`));
        if (error.stack) {
          this.logger.debug(`Stack trace: ${error.stack}`);
        }
        break;
        
      default:
        this.logger.error(chalk.red(`Error: ${errorInfo.message}`));
    }
    
    // Log context if available
    if (error.context) {
      this.logger.debug(`Context: ${JSON.stringify(error.context, null, 2)}`);
    }
  }

  /**
   * Format error information for display
   */
  private formatErrorInfo(error: ReviewError): { message: string; suggestion?: string } {
    let message = error.message;
    let suggestion: string | undefined = undefined;

    // Add helpful suggestions for common errors
    if (error instanceof UserError) {
      if (error.message.includes('not found')) {
        suggestion = 'Please check the file path and ensure the file exists.';
      } else if (error.message.includes('permission')) {
        suggestion = 'Please check file permissions or run with appropriate privileges.';
      } else if (error.message.includes('PR')) {
        suggestion = 'Please verify the PR URL or ID and ensure you have access to the repository.';
      }
    } else if (error instanceof APIError) {
      if (error.statusCode === 401) {
        suggestion = 'Please check your authentication credentials.';
      } else if (error.statusCode === 403) {
        suggestion = 'Please ensure you have the necessary permissions for this operation.';
      } else if (error.statusCode === 404) {
        suggestion = 'Please verify the resource exists and the URL/ID is correct.';
      } else if (error.statusCode && error.statusCode >= 500) {
        suggestion = 'This appears to be a server error. Please try again later.';
      }
    }

    const result: { message: string; suggestion?: string } = { message };
    if (suggestion !== undefined) {
      result.suggestion = suggestion;
    }
    return result;
  }

  /**
   * Track error for analytics
   */
  private trackError(error: ReviewError): void {
    const errorType = error.constructor.name;
    const currentCount = this.errorCounts.get(errorType) || 0;
    this.errorCounts.set(errorType, currentCount + 1);
  }

  /**
   * Create error from HTTP response
   */
  public createFromHttpResponse(
    response: { status: number; statusText: string; data?: any },
    context?: ErrorContext
  ): APIError {
    const isRetryable = response.status >= 500 || response.status === 429;
    const message = `HTTP ${response.status}: ${response.statusText}`;
    
    return new APIError(
      message,
      response.status,
      response.data,
      context,
      isRetryable
    );
  }

  /**
   * Wrap async operation with error handling
   */
  public async withErrorHandling<T>(
    operation: () => Promise<T>,
    context?: ErrorContext
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const reviewError = this.normalizeError(error);
      if (context) {
        reviewError.context = { ...reviewError.context, ...context };
      }
      throw reviewError;
    }
  }
}