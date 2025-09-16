import { Logger } from './logger';
export interface ReviewResult {
    hasErrors: boolean;
    hasFindings: boolean;
    findingsCount: number;
    commentsPosted: number;
    processingTime: number;
    errorMessage?: string;
    errorStack?: string;
    errorType?: string;
}
export declare class ReviewOrchestrator {
    private logger;
    private errorHandler;
    private options;
    private argsParser;
    private configLoader;
    private adoClient?;
    private gitManager?;
    private diffFetcher?;
    private rulesLoader?;
    private contextBuilder?;
    private reviewPlanner?;
    private llmAdapter?;
    private resultMapper?;
    private commenter?;
    private statusReporter?;
    private workspace?;
    constructor(logger: Logger, options: any);
    private rawOptions;
    /**
     * Main orchestration method
     */
    run(): Promise<ReviewResult>;
    /**
     * Initialize components and validate options
     */
    private initialize;
    /**
     * Setup workspace for review
     */
    private setupWorkspace;
    /**
     * Extract PR ID from Azure DevOps URL
     */
    private extractPRIdFromUrl;
    /**
     * Fetch PR information
     */
    private fetchPRInfo;
    /**
     * Fetch PR diffs
     */
    private fetchDiffs;
    /**
     * Load rules from files
     */
    private loadRules;
    /**
     * Build review context
     */
    private buildContext;
    /**
     * Convert PullRequestDiff to DiffHunk[] format expected by ContextBuilder
     */
    private convertPullRequestDiffToHunks;
    /**
     * Plan review strategy
     */
    private planReview;
    /**
     * Execute AI review with batch processing and rate limiting
     */
    private executeReview;
    /**
     * Execute single review for small PRs
     */
    private executeSingleReview;
    /**
     * Execute batched review with rate limiting for large PRs
     */
    private executeBatchedReview;
    /**
     * Handle rate limit errors with multiple fallback strategies
     */
    private handleRateLimitError;
    /**
     * Handle general errors with fallback strategies
     */
    private handleGeneralError;
    /**
     * Try splitting batch into smaller pieces as fallback
     */
    private trySplitBatchFallback;
    /**
     * Emergency fallback for multiple consecutive failures
     */
    private applyEmergencyFallback;
    /**
     * Create context for a specific batch
     */
    private createBatchContext;
    /**
     * Calculate delay between batches based on batch count
     */
    private calculateBatchDelay;
    /**
     * Calculate exponential backoff delay for rate limit errors
     */
    private calculateExponentialBackoff;
    /**
     * Check if error is a rate limit error
     */
    private isRateLimitError;
    /**
     * Sleep for specified milliseconds
     */
    private sleep;
    /**
     * Create a reduced version of batch with fewer hunks
     */
    private createReducedBatch;
    /**
     * Create a simplified version of batch with essential info only
     */
    private createSimplifiedBatch;
    /**
     * Split batch into smaller sub-batches
     */
    private splitBatchIntoSmaller;
    /**
     * Generate basic findings when AI review fails
     */
    private generateBasicFindings;
    /**
     * Process and filter findings
     */
    private processFindings;
    /**
     * Get user approval for findings
     */
    private getApproval;
    /**
     * Post comments to PR
     */
    private postComments;
    /**
     * Update PR status
     */
    private updatePRStatus;
    /**
     * Display findings in console
     */
    /**
     * Prompt user for approval of findings
     */
    private promptUserApproval;
    /**
     * Allow user to selectively approve findings
     */
    private selectiveApproval;
    /**
     * Approve the current pull request
     */
    private approvePullRequest;
    private displayFindings;
}
//# sourceMappingURL=reviewOrchestrator.d.ts.map