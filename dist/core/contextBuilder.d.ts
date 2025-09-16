import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';
import { LoadedRules } from './rulesLoader';
export interface DiffHunk {
    filePath: string;
    oldStartLine: number;
    oldLineCount: number;
    newStartLine: number;
    newLineCount: number;
    content: string;
    changeType: 'added' | 'modified' | 'deleted';
}
export interface ReviewContext {
    projectGuidelines: string;
    reviewRules: string;
    diffs: string;
    customPromptTemplate?: string;
    metadata: {
        totalFiles: number;
        totalHunks: number;
        totalLines: number;
        ruleCount: number;
        guidelineCount: number;
    };
}
export interface ContextOptions {
    maxTokens?: number;
    includeMetadata?: boolean;
    compactFormat?: boolean;
    prioritizeRules?: string[];
    customPromptTemplate?: string;
}
export declare class ContextBuilder {
    private logger;
    private errorHandler;
    constructor(logger: Logger, errorHandler: ErrorHandler);
    /**
     * Build review context from loaded rules and diffs
     */
    buildContext(loadedRules: LoadedRules, diffHunks: DiffHunk[], options?: ContextOptions): ReviewContext;
    /**
     * Build a ReviewContext from an existing base (guidelines + rules) and a set of hunks
     * Useful for batched reviews to avoid rebuilding rules/guidelines every time.
     */
    buildContextForHunks(base: {
        projectGuidelines: string;
        reviewRules: string;
        customPromptTemplate?: string;
    }, hunks: DiffHunk[], options?: {
        compactFormat?: boolean;
    }): ReviewContext;
    /**
     * Convert context to LLM prompt
     */
    toPrompt(context: ReviewContext, options?: ContextOptions): string;
    /**
     * Split context into batches for large reviews
     */
    splitIntoBatches(loadedRules: LoadedRules, diffHunks: DiffHunk[], maxTokensPerBatch?: number): ReviewContext[];
    /**
     * Create a single batch
     */
    private createBatch;
    /**
     * Build guidelines section
     */
    private buildGuidelinesSection;
    /**
     * Build rules section
     */
    private buildRulesSection;
    /**
     * Build diffs section
     */
    private buildDiffsSection;
    /**
     * Build metadata section
     */
    private buildMetadataSection;
    /**
     * Get review instructions
     */
    private getReviewInstructions;
    /**
     * Apply custom prompt template with context data
     */
    private applyCustomTemplate;
    /**
     * Merge rule sets with prioritization
     */
    private mergeRuleSets;
    /**
     * Estimate token count for context
     */
    private estimateTokenCount;
    /**
     * Estimate token count for a single hunk
     */
    private estimateHunkTokens;
    /**
     * Truncate content to specified length
     */
    private truncateContent;
    /**
     * Get context summary
     */
    getSummary(context: ReviewContext): string;
    /**
     * Validate context
     */
    validateContext(context: ReviewContext): {
        valid: boolean;
        issues: string[];
    };
}
//# sourceMappingURL=contextBuilder.d.ts.map