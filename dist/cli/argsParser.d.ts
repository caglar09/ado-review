import { Logger } from '../core/logger.js';
export interface ReviewOptions {
    prUrl?: string;
    pr?: string;
    org?: string;
    project?: string;
    repo?: string;
    rules: string[];
    projectRules?: string;
    customPromptTemplate?: string;
    include: string[];
    exclude: string[];
    files: string[];
    allFiles: boolean;
    provider: 'gemini-api' | 'openai' | 'openrouter';
    model: string;
    maxContextTokens: number;
    ratelimitBatch: number;
    ratelimitSleepMs: number;
    tmpDir?: string;
    keepWorkdir: boolean;
    postStatus: boolean;
    autoApprove: boolean;
    dryRun: boolean;
    format: 'table' | 'json';
    severityThreshold: 'info' | 'warning' | 'error';
    verbose: boolean;
}
export interface ParsedPRInfo {
    type: 'url' | 'id';
    url?: string;
    id?: string;
    org?: string;
    project?: string;
    repo?: string;
}
export declare class ArgsParser {
    private logger;
    constructor(logger: Logger);
    /**
     * Parse and validate CLI options
     */
    parseOptions(options: any): Promise<ReviewOptions>;
    /**
     * Parse PR information from options
     */
    parsePRInfo(options: ReviewOptions): ParsedPRInfo;
    /**
     * Expand glob patterns in rules paths
     */
    private expandRulesPaths;
    /**
     * Validate parsed options
     */
    private validateOptions;
    /**
     * Validate Azure DevOps PR URL format
     */
    private isValidAzureDevOpsPRUrl;
    /**
     * Extract PR ID from Azure DevOps URL
     */
    extractPRIdFromUrl(url: string): string | null;
    /**
     * Extract organization, project, and repo from Azure DevOps URL
     */
    extractRepoInfoFromUrl(url: string): {
        org: string;
        project: string;
        repo: string;
    } | null;
    /**
     * Get valid models from defaults.yaml configuration
     */
    private getValidModelsFromConfig;
    private getDefaultModelForProvider;
    private getDefaultProviderFromConfig;
}
//# sourceMappingURL=argsParser.d.ts.map