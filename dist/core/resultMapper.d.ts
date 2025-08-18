import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';
import { ReviewResult } from './geminiAdapter';
export interface ADOComment {
    id?: number;
    content: string;
    commentType: 'text' | 'system';
    status: 'active' | 'fixed' | 'wontFix' | 'closed';
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
    properties?: Record<string, any>;
}
export interface ADOCommentThread {
    id?: number;
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
    comments: ADOComment[];
    status: 'active' | 'fixed' | 'wontFix' | 'closed';
    properties?: Record<string, any>;
}
export interface MappingOptions {
    maxCommentsPerThread: number;
    maxThreadsPerFile: number;
    maxTotalThreads: number;
    includeRuleId: boolean;
    includeCategory: boolean;
    includeSuggestions: boolean;
    groupBySeverity: boolean;
    createSummaryComment: boolean;
    summaryCommentThreshold: number;
}
export interface MappingResult {
    threads: ADOCommentThread[];
    summaryComment?: ADOComment;
    stats: {
        totalFindings: number;
        mappedFindings: number;
        skippedFindings: number;
        threadsCreated: number;
        commentsCreated: number;
    };
}
export declare class ResultMapper {
    private logger;
    private errorHandler;
    private defaultOptions;
    constructor(logger: Logger, errorHandler: ErrorHandler);
    /**
     * Map review results to ADO comment threads
     */
    mapToCommentThreads(reviewResult: ReviewResult, options?: Partial<MappingOptions>): MappingResult;
    /**
     * Group findings by file and line
     */
    private groupFindings;
    /**
     * Create comment threads for a file
     */
    private createThreadsForFile;
    /**
     * Group findings by line
     */
    private groupByLine;
    /**
     * Create thread for severity group
     */
    private createSeverityGroupThread;
    /**
     * Create thread for line group
     */
    private createLineThread;
    /**
     * Create severity header content
     */
    private createSeverityHeaderContent;
    /**
     * Create comment for a finding
     */
    private createFindingComment;
    /**
     * Create summary comment
     */
    private createSummaryComment;
    /**
     * Validate comment thread
     */
    validateCommentThread(thread: ADOCommentThread): boolean;
    /**
     * Get mapping statistics
     */
    getStatistics(result: MappingResult): string;
    /**
     * Get mapper summary
     */
    getSummary(): string;
}
//# sourceMappingURL=resultMapper.d.ts.map