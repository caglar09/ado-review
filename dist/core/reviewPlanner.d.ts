import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';
import { DiffHunk } from './contextBuilder';
export interface ReviewPlan {
    strategy: 'single' | 'batch';
    batches: ReviewBatch[];
    totalFiles: number;
    totalHunks: number;
    estimatedTokens: number;
    estimatedDuration: number;
}
export interface ReviewBatch {
    id: string;
    hunks: DiffHunk[];
    files: string[];
    estimatedTokens: number;
    priority: 'high' | 'medium' | 'low';
    description: string;
}
export interface PlanningOptions {
    maxTokensPerBatch?: number;
    maxFilesPerBatch?: number;
    maxHunksPerBatch?: number;
    prioritizeFileTypes?: string[];
    excludeFileTypes?: string[];
    batchStrategy?: 'file-based' | 'size-based' | 'mixed';
    forceStrategy?: 'single' | 'batch';
}
export interface PlanningHeuristics {
    smallReviewThreshold: number;
    mediumReviewThreshold: number;
    largeReviewThreshold: number;
    maxTokensForSingle: number;
    avgTokensPerHunk: number;
    criticalFilePatterns: string[];
    testFilePatterns: string[];
    configFilePatterns: string[];
}
export declare class ReviewPlanner {
    private logger;
    private errorHandler;
    private heuristics;
    constructor(logger: Logger, errorHandler: ErrorHandler);
    /**
     * Create review plan based on diff hunks
     */
    createPlan(diffHunks: DiffHunk[], options?: PlanningOptions): ReviewPlan;
    /**
     * Determine optimal strategy based on heuristics
     */
    private determineStrategy;
    /**
     * Create single batch containing all hunks
     */
    private createSingleBatch;
    /**
     * Create multiple batches
     */
    private createMultipleBatches;
    /**
     * Create file-based batches (group by file type/category)
     */
    private createFileBasedBatches;
    /**
     * Create size-based batches (optimize for token/size limits)
     */
    private createSizeBasedBatches;
    /**
     * Create mixed batches (balance file grouping and size limits)
     */
    private createMixedBatches;
    /**
     * Split hunks into batches respecting size limits
     */
    private splitHunksIntoBatches;
    /**
     * Create batch from hunks
     */
    private createBatchFromHunks;
    /**
     * Categorize hunks by file type/purpose
     */
    private categorizeHunks;
    /**
     * Get file category based on path patterns
     */
    private getFileCategory;
    /**
     * Separate critical hunks from regular ones
     */
    private separateCriticalHunks;
    /**
     * Determine batch priority
     */
    private determineBatchPriority;
    /**
     * Generate batch description
     */
    private generateBatchDescription;
    /**
     * Optimize batches (merge small ones, split large ones)
     */
    private optimizeBatches;
    /**
     * Filter hunks based on criteria
     */
    private filterHunks;
    /**
     * Check if file path matches any of the patterns
     */
    private matchesPatterns;
    /**
     * Estimate total tokens for all hunks
     */
    private estimateTotalTokens;
    /**
     * Estimate tokens for a single hunk
     */
    private estimateHunkTokens;
    /**
     * Estimate duration for batches
     */
    private estimateDuration;
    /**
     * Create empty plan
     */
    private createEmptyPlan;
    /**
     * Get plan summary
     */
    getSummary(plan: ReviewPlan): string;
    /**
     * Update heuristics
     */
    updateHeuristics(updates: Partial<PlanningHeuristics>): void;
}
//# sourceMappingURL=reviewPlanner.d.ts.map