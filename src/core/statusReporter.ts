import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';
import { ADOClient } from './adoClient';

export interface StatusOptions {
  enabled: boolean;
  statusName: string;
  description: string;
  targetUrl?: string;
  genre: 'pr-azure-repos' | 'continuous-integration';
  iterationId?: number;
  updateExisting: boolean;
  retryAttempts: number;
  retryDelay: number;
}

export interface StatusResult {
  success: boolean;
  statusId?: number;
  message: string;
  error?: string;
}

export interface PRStatus {
  id?: number;
  state: 'error' | 'failed' | 'notApplicable' | 'notSet' | 'pending' | 'succeeded';
  description: string;
  context: {
    name: string;
    genre: string;
  };
  targetUrl?: string;
  iterationId?: number;
  createdBy?: {
    id: string;
    displayName: string;
  };
  creationDate?: string;
  updatedDate?: string;
}

export interface ReviewSummary {
  totalFindings: number;
  criticalFindings: number;
  majorFindings: number;
  minorFindings: number;
  infoFindings: number;
  filesReviewed: number;
  linesReviewed: number;
  reviewDuration: number;
  success: boolean;
  errors: string[];
}

export class StatusReporter {
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private adoClient: ADOClient;
  private defaultOptions: StatusOptions;

  constructor(logger: Logger, errorHandler: ErrorHandler, adoClient: ADOClient) {
    this.logger = logger;
    this.errorHandler = errorHandler;
    this.adoClient = adoClient;
    this.defaultOptions = {
      enabled: true,
      statusName: 'ado-review/code-review',
      description: 'AI-powered code review',
      genre: 'continuous-integration',
      updateExisting: true,
      retryAttempts: 3,
      retryDelay: 1000
    };
  }

  /**
   * Set PR status to pending (review started)
   */
  public async setPending(
    pullRequestId: number,
    options: Partial<StatusOptions> = {}
  ): Promise<StatusResult> {
    const opts = { ...this.defaultOptions, ...options };
    
    if (!opts.enabled) {
      this.logger.debug('Status reporting is disabled');
      return { success: true, message: 'Status reporting disabled' };
    }

    try {
      this.logger.debug(`Setting PR ${pullRequestId} status to pending`);
      
      const status: PRStatus = {
        state: 'pending',
        description: opts.description + ' - Review in progress',
        context: {
          name: opts.statusName,
          genre: opts.genre
        },
        ...(opts.targetUrl && { targetUrl: opts.targetUrl }),
        ...(opts.iterationId && { iterationId: opts.iterationId })
      };

      const result = await this.postStatus(pullRequestId, status, opts);
      
      if (result.success) {
        this.logger.info(`PR ${pullRequestId} status set to pending`);
      }
      
      return result;
    } catch (error) {
      return this.handleStatusError(error as Error, 'setPending', pullRequestId);
    }
  }

  /**
   * Set PR status to success (review completed successfully)
   */
  public async setSuccess(
    pullRequestId: number,
    summary: ReviewSummary,
    options: Partial<StatusOptions> = {}
  ): Promise<StatusResult> {
    const opts = { ...this.defaultOptions, ...options };
    
    if (!opts.enabled) {
      this.logger.debug('Status reporting is disabled');
      return { success: true, message: 'Status reporting disabled' };
    }

    try {
      this.logger.debug(`Setting PR ${pullRequestId} status to success`);
      
      const description = this.buildSuccessDescription(summary, opts.description);
      
      const status: PRStatus = {
        state: 'succeeded',
        description,
        context: {
          name: opts.statusName,
          genre: opts.genre
        },
        ...(opts.targetUrl && { targetUrl: opts.targetUrl }),
        ...(opts.iterationId && { iterationId: opts.iterationId })
      };

      const result = await this.postStatus(pullRequestId, status, opts);
      
      if (result.success) {
        this.logger.info(`PR ${pullRequestId} status set to success: ${description}`);
      }
      
      return result;
    } catch (error) {
      return this.handleStatusError(error as Error, 'setSuccess', pullRequestId);
    }
  }

  /**
   * Set PR status to failed (review completed with critical issues)
   */
  public async setFailed(
    pullRequestId: number,
    summary: ReviewSummary,
    options: Partial<StatusOptions> = {}
  ): Promise<StatusResult> {
    const opts = { ...this.defaultOptions, ...options };
    
    if (!opts.enabled) {
      this.logger.debug('Status reporting is disabled');
      return { success: true, message: 'Status reporting disabled' };
    }

    try {
      this.logger.debug(`Setting PR ${pullRequestId} status to failed`);
      
      const description = this.buildFailedDescription(summary, opts.description);
      
      const status: PRStatus = {
        state: 'failed',
        description,
        context: {
          name: opts.statusName,
          genre: opts.genre
        },
        ...(opts.targetUrl && { targetUrl: opts.targetUrl }),
        ...(opts.iterationId && { iterationId: opts.iterationId })
      };

      const result = await this.postStatus(pullRequestId, status, opts);
      
      if (result.success) {
        this.logger.info(`PR ${pullRequestId} status set to failed: ${description}`);
      }
      
      return result;
    } catch (error) {
      return this.handleStatusError(error as Error, 'setFailed', pullRequestId);
    }
  }

  /**
   * Set PR status to error (review failed due to technical issues)
   */
  public async setError(
    pullRequestId: number,
    errorMessage: string,
    options: Partial<StatusOptions> = {}
  ): Promise<StatusResult> {
    const opts = { ...this.defaultOptions, ...options };
    
    if (!opts.enabled) {
      this.logger.debug('Status reporting is disabled');
      return { success: true, message: 'Status reporting disabled' };
    }

    try {
      this.logger.debug(`Setting PR ${pullRequestId} status to error`);
      
      const description = `${opts.description} - Error: ${this.truncateMessage(errorMessage, 200)}`;
      
      const status: PRStatus = {
        state: 'error',
        description,
        context: {
          name: opts.statusName,
          genre: opts.genre
        },
        ...(opts.targetUrl && { targetUrl: opts.targetUrl }),
        ...(opts.iterationId && { iterationId: opts.iterationId })
      };

      const result = await this.postStatus(pullRequestId, status, opts);
      
      if (result.success) {
        this.logger.info(`PR ${pullRequestId} status set to error: ${description}`);
      }
      
      return result;
    } catch (error) {
      return this.handleStatusError(error as Error, 'setError', pullRequestId);
    }
  }

  /**
   * Get current PR statuses
   */
  public async getStatuses(
    pullRequestId: number,
    iterationId?: number
  ): Promise<PRStatus[]> {
    try {
      this.logger.debug(`Getting statuses for PR ${pullRequestId}`);
      
      const statuses = await this.adoClient.getPullRequestStatuses(pullRequestId, iterationId);
      
      return statuses.map((status: any) => ({
        id: status.id,
        state: status.state,
        description: status.description,
        context: status.context,
        targetUrl: status.targetUrl,
        iterationId: status.iterationId,
        createdBy: status.createdBy,
        creationDate: status.creationDate,
        updatedDate: status.updatedDate
      }));
    } catch (error) {
      throw this.errorHandler.createFromError(
        error as Error,
'Failed to get PR statuses'
      );
    }
  }

  /**
   * Find existing status by name
   */
  public async findExistingStatus(
    pullRequestId: number,
    statusName: string,
    iterationId?: number
  ): Promise<PRStatus | undefined> {
    try {
      const statuses = await this.getStatuses(pullRequestId, iterationId);
      
      return statuses.find(status => 
        status.context.name === statusName &&
        (!iterationId || status.iterationId === iterationId)
      );
    } catch (error) {
      this.logger.warn(`Failed to find existing status: ${(error as Error).message}`);
      return undefined;
    }
  }

  /**
   * Post status with retry logic
   */
  private async postStatus(
    pullRequestId: number,
    status: PRStatus,
    options: StatusOptions
  ): Promise<StatusResult> {
    try {
      // Check if we should update existing status
      if (options.updateExisting) {
        const existingStatus = await this.findExistingStatus(
          pullRequestId,
          status.context.name,
          status.iterationId
        );
        
        if (existingStatus) {
          this.logger.debug(`Updating existing status ${existingStatus.id}`);
          // Update existing status
          const updatedStatus = await this.retryOperation(
            () => this.adoClient.updatePullRequestStatus(pullRequestId, String(existingStatus.id!), status.state as 'pending' | 'succeeded' | 'failed' | 'error', status.description),
            options.retryAttempts,
            options.retryDelay,
            'update status'
          );
          
          return {
            success: true,
            statusId: updatedStatus?.id || existingStatus.id!,
            message: `Status updated: ${status.description}`
          };
        }
      }
      
      // Create new status
      const newStatus = await this.retryOperation(
        () => this.adoClient.createPullRequestStatus(pullRequestId, status),
        options.retryAttempts,
        options.retryDelay,
        'create status'
      );
      
      return {
        success: true,
        statusId: newStatus?.id || 'unknown',
        message: `Status created: ${status.description}`
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Build success description
   */
  private buildSuccessDescription(summary: ReviewSummary, baseDescription: string): string {
    const parts = [baseDescription];
    
    if (summary.totalFindings === 0) {
      parts.push('- No issues found');
    } else {
      const findings = [];
      if (summary.criticalFindings > 0) findings.push(`${summary.criticalFindings} critical`);
      if (summary.majorFindings > 0) findings.push(`${summary.majorFindings} major`);
      if (summary.minorFindings > 0) findings.push(`${summary.minorFindings} minor`);
      if (summary.infoFindings > 0) findings.push(`${summary.infoFindings} info`);
      
      parts.push(`- ${findings.join(', ')} issues found`);
    }
    
    parts.push(`- ${summary.filesReviewed} files reviewed`);
    
    return this.truncateMessage(parts.join(' '), 400);
  }

  /**
   * Build failed description
   */
  private buildFailedDescription(summary: ReviewSummary, baseDescription: string): string {
    const parts = [baseDescription];
    
    if (summary.criticalFindings > 0) {
      parts.push(`- ${summary.criticalFindings} critical issues must be addressed`);
    }
    
    if (summary.majorFindings > 0) {
      parts.push(`- ${summary.majorFindings} major issues found`);
    }
    
    parts.push(`- ${summary.totalFindings} total issues in ${summary.filesReviewed} files`);
    
    return this.truncateMessage(parts.join(' '), 400);
  }

  /**
   * Truncate message to fit Azure DevOps limits
   */
  private truncateMessage(message: string, maxLength: number): string {
    if (message.length <= maxLength) {
      return message;
    }
    
    return message.substring(0, maxLength - 3) + '...';
  }

  /**
   * Handle status operation errors
   */
  private handleStatusError(
    error: Error,
    operation: string,
    pullRequestId: number
  ): StatusResult {
    const errorMessage = `Failed to ${operation} for PR ${pullRequestId}: ${error.message}`;
    this.logger.error(errorMessage);
    
    return {
      success: false,
      message: errorMessage,
      error: error.message
    };
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxAttempts: number,
    baseDelay: number,
    operationName: string
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxAttempts) {
          throw lastError;
        }
        
        // Check if error is retryable
        if (!this.isRetryableError(lastError)) {
          throw lastError;
        }
        
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        this.logger.warn(`${operationName} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms: ${lastError.message}`);
        
        await this.delay(delay);
      }
    }
    
    throw lastError!;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Retryable conditions
    const retryablePatterns = [
      'timeout',
      'network',
      'connection',
      'rate limit',
      '429',
      '500',
      '502',
      '503',
      '504'
    ];
    
    return retryablePatterns.some(pattern => message.includes(pattern));
  }

  /**
   * Delay execution
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create review summary from results
   */
  public createSummary(
    findings: Array<{ severity: string }>,
    filesReviewed: number,
    linesReviewed: number,
    reviewDuration: number,
    errors: string[] = []
  ): ReviewSummary {
    const summary: ReviewSummary = {
      totalFindings: findings.length,
      criticalFindings: findings.filter(f => f.severity === 'critical').length,
      majorFindings: findings.filter(f => f.severity === 'major').length,
      minorFindings: findings.filter(f => f.severity === 'minor').length,
      infoFindings: findings.filter(f => f.severity === 'info').length,
      filesReviewed,
      linesReviewed,
      reviewDuration,
      success: errors.length === 0,
      errors
    };
    
    return summary;
  }

  /**
   * Determine if review should be marked as failed
   */
  public shouldMarkAsFailed(summary: ReviewSummary): boolean {
    // Mark as failed if there are critical issues or too many major issues
    return summary.criticalFindings > 0 || summary.majorFindings > 10;
  }

  /**
   * Get status reporter summary
   */
  public getSummary(): string {
    return 'PR status reporter for Azure DevOps';
  }

  /**
   * Validate status options
   */
  public validateOptions(options: Partial<StatusOptions>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (options.statusName && options.statusName.trim().length === 0) {
      errors.push('Status name cannot be empty');
    }
    
    if (options.description && options.description.trim().length === 0) {
      errors.push('Description cannot be empty');
    }
    
    if (options.description && options.description.length > 400) {
      errors.push('Description cannot exceed 400 characters');
    }
    
    if (options.targetUrl && !this.isValidUrl(options.targetUrl)) {
      errors.push('Target URL must be a valid URL');
    }
    
    if (options.retryAttempts !== undefined && (options.retryAttempts < 0 || options.retryAttempts > 10)) {
      errors.push('Retry attempts must be between 0 and 10');
    }
    
    if (options.retryDelay !== undefined && (options.retryDelay < 0 || options.retryDelay > 60000)) {
      errors.push('Retry delay must be between 0 and 60000 milliseconds');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if URL is valid
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}