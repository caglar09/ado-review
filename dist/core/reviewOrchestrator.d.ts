import { Logger } from './logger';
export interface ReviewResult {
    hasErrors: boolean;
    hasFindings: boolean;
    findingsCount: number;
    commentsPosted: number;
    processingTime: number;
}
export interface ReviewFinding {
    file: string;
    line: number;
    endLine?: number;
    severity: 'info' | 'warning' | 'error';
    message: string;
    suggestion?: string;
    ruleId?: string;
    category?: string;
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
    private geminiAdapter?;
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
     * Execute AI review
     */
    private executeReview;
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
    private displayFindings;
}
//# sourceMappingURL=reviewOrchestrator.d.ts.map