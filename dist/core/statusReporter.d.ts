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
export declare class StatusReporter {
    private logger;
    private errorHandler;
    private adoClient;
    private defaultOptions;
    constructor(logger: Logger, errorHandler: ErrorHandler, adoClient: ADOClient);
    /**
     * Set PR status to pending (review started)
     */
    setPending(pullRequestId: number, options?: Partial<StatusOptions>): Promise<StatusResult>;
    /**
     * Set PR status to success (review completed successfully)
     */
    setSuccess(pullRequestId: number, summary: ReviewSummary, options?: Partial<StatusOptions>): Promise<StatusResult>;
    /**
     * Set PR status to failed (review completed with critical issues)
     */
    setFailed(pullRequestId: number, summary: ReviewSummary, options?: Partial<StatusOptions>): Promise<StatusResult>;
    /**
     * Set PR status to error (review failed due to technical issues)
     */
    setError(pullRequestId: number, errorMessage: string, options?: Partial<StatusOptions>): Promise<StatusResult>;
    /**
     * Get current PR statuses
     */
    getStatuses(pullRequestId: number, iterationId?: number): Promise<PRStatus[]>;
    /**
     * Find existing status by name
     */
    findExistingStatus(pullRequestId: number, statusName: string, iterationId?: number): Promise<PRStatus | undefined>;
    /**
     * Post status with retry logic
     */
    private postStatus;
    /**
     * Build success description
     */
    private buildSuccessDescription;
    /**
     * Build failed description
     */
    private buildFailedDescription;
    /**
     * Truncate message to fit Azure DevOps limits
     */
    private truncateMessage;
    /**
     * Handle status operation errors
     */
    private handleStatusError;
    /**
     * Retry operation with exponential backoff
     */
    private retryOperation;
    /**
     * Check if error is retryable
     */
    private isRetryableError;
    /**
     * Delay execution
     */
    private delay;
    /**
     * Create review summary from results
     */
    createSummary(findings: Array<{
        severity: string;
    }>, filesReviewed: number, linesReviewed: number, reviewDuration: number, errors?: string[]): ReviewSummary;
    /**
     * Determine if review should be marked as failed
     */
    shouldMarkAsFailed(summary: ReviewSummary): boolean;
    /**
     * Get status reporter summary
     */
    getSummary(): string;
    /**
     * Validate status options
     */
    validateOptions(options: Partial<StatusOptions>): {
        valid: boolean;
        errors: string[];
    };
    /**
     * Check if URL is valid
     */
    private isValidUrl;
}
//# sourceMappingURL=statusReporter.d.ts.map