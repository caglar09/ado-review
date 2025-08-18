import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';
import { ADOClient } from './adoClient';
import { ADOCommentThread, MappingResult } from './resultMapper';
export interface CommentOptions {
    dryRun: boolean;
    batchSize: number;
    delayBetweenBatches: number;
    retryAttempts: number;
    retryDelay: number;
    skipExistingComments: boolean;
    updateExistingComments: boolean;
    maxCommentsPerRequest: number;
}
export interface CommentResult {
    success: boolean;
    threadsCreated: number;
    threadsUpdated: number;
    threadsSkipped: number;
    commentsCreated: number;
    commentsUpdated: number;
    errors: string[];
    warnings: string[];
}
export interface ExistingThread {
    id: number;
    threadContext?: {
        filePath: string;
        rightFileStart: {
            line: number;
            offset: number;
        };
        rightFileEnd: {
            line: number;
            offset: number;
        };
    };
    comments: Array<{
        id: number;
        content: string;
        properties?: Record<string, any>;
    }>;
    properties?: Record<string, any>;
}
export declare class Commenter {
    private logger;
    private errorHandler;
    private adoClient;
    private defaultOptions;
    constructor(logger: Logger, errorHandler: ErrorHandler, adoClient: ADOClient);
    /**
     * Post comment threads to Azure DevOps
     */
    postComments(pullRequestId: number, mappingResult: MappingResult, options?: Partial<CommentOptions>): Promise<CommentResult>;
    /**
     * Simulate posting for dry run
     */
    private simulatePosting;
    /**
     * Get existing comment threads
     */
    private getExistingThreads;
    /**
     * Create batches from threads
     */
    private createBatches;
    /**
     * Process a batch of threads
     */
    private processBatch;
    /**
     * Find existing thread that matches the new thread
     */
    private findExistingThread;
    /**
     * Create new comment thread
     */
    private createNewThread;
    /**
     * Update existing comment thread
     */
    private updateExistingThread;
    /**
     * Check if two comments are similar (to avoid duplicates)
     */
    private areCommentsSimilar;
    /**
     * Calculate text similarity (simple Jaccard similarity)
     */
    private calculateSimilarity;
    /**
     * Post summary comment
     */
    private postSummaryComment;
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
     * Validate comment thread before posting
     */
    validateThread(thread: ADOCommentThread): {
        valid: boolean;
        errors: string[];
    };
    /**
     * Get posting statistics
     */
    getStatistics(result: CommentResult): string;
    /**
     * Get commenter summary
     */
    getSummary(): string;
}
//# sourceMappingURL=commenter.d.ts.map