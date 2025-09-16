import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';
export interface AppConfig {
    azo: {
        timeout: number;
        maxRetries: number;
        retryDelay: number;
        apiVersion: string;
    };
    git: {
        depth: number;
        timeout: number;
        excludePatterns: string[];
    };
    gemini: {
        defaultModel: string;
        availableModels: string[];
        maxContextTokens: number;
        temperature: number;
        topP: number;
        topK: number;
        timeout: number;
    };
    openai?: {
        defaultModel: string;
        availableModels?: string[];
        timeout?: number;
    };
    openrouter?: {
        defaultModel: string;
        availableModels?: string[];
        timeout?: number;
        baseUrl?: string;
    };
    llm?: {
        defaultProvider: 'gemini-api' | 'openai' | 'openrouter';
    };
    rateLimit: {
        batchSize: number;
        sleepMs: number;
        maxConcurrent: number;
        backoffMultiplier: number;
        maxBackoffMs: number;
    };
    review: {
        severityThreshold: string;
        severityLevels: string[];
        format: string;
        formats: string[];
        maxTableFindings: number;
        maxDiffLineLength: number;
        contextLines: number;
    };
    files: {
        defaultInclude: string[];
        defaultExclude: string[];
        maxFileSize: number;
        maxTotalFiles: number;
    };
    workspace: {
        tmpPrefix: string;
        cleanupTimeout: number;
        maxSize: number;
    };
    logging: {
        level: string;
        levels: string[];
        file: {
            enabled: boolean;
            path: string;
            maxSize: number;
            maxFiles: number;
        };
        console: {
            enabled: boolean;
            colors: boolean;
            timestamps: boolean;
        };
        maskSecrets: string[];
    };
    comments: {
        maxCommentsPerPR: number;
        maxCommentLength: number;
        idempotent: boolean;
        template: string;
    };
    status: {
        context: string;
        descriptions: {
            pending: string;
            success: string;
            failed: string;
            error: string;
        };
        targetUrl: string | null;
    };
    errors: {
        exitCodes: {
            success: number;
            hasFindings: number;
            userError: number;
            apiError: number;
            internalError: number;
        };
        retry: {
            maxRetries: number;
            initialDelay: number;
            maxDelay: number;
            backoffMultiplier: number;
        };
        timeouts: {
            default: number;
            git: number;
            llm: number;
            api: number;
        };
    };
}
export declare class ConfigLoader {
    private logger;
    private errorHandler;
    private config;
    private configPath;
    private userConfigPath;
    private workspaceConfigPath?;
    constructor(logger: Logger, errorHandler: ErrorHandler, workspaceDir?: string);
    /**
     * Deep merge user configuration with default configuration
     */
    private mergeConfigs;
    /**
     * Load configuration from defaults.yaml and merge with .adorevrc.yaml if present
     */
    loadConfig(): Promise<AppConfig>;
    /**
     * Get configuration (load if not already loaded)
     */
    getConfig(): Promise<AppConfig>;
    /**
     * Get Gemini configuration
     */
    getGeminiConfig(): Promise<AppConfig['gemini']>;
    /**
     * Get Azure DevOps configuration
     */
    getAzureDevOpsConfig(): Promise<AppConfig['azo']>;
    /**
     * Get Git configuration
     */
    getGitConfig(): Promise<AppConfig['git']>;
    /**
     * Get Rate Limit configuration
     */
    getRateLimitConfig(): Promise<AppConfig['rateLimit']>;
    /**
     * Get Review configuration
     */
    getReviewConfig(): Promise<AppConfig['review']>;
    /**
     * Get Files configuration
     */
    getFilesConfig(): Promise<AppConfig['files']>;
    /**
     * Get Workspace configuration
     */
    getWorkspaceConfig(): Promise<AppConfig['workspace']>;
    /**
     * Get Logging configuration
     */
    getLoggingConfig(): Promise<AppConfig['logging']>;
    /**
     * Get Comments configuration
     */
    getCommentsConfig(): Promise<AppConfig['comments']>;
    /**
     * Get Status configuration
     */
    getStatusConfig(): Promise<AppConfig['status']>;
    /**
     * Get Errors configuration
     */
    getErrorsConfig(): Promise<AppConfig['errors']>;
}
//# sourceMappingURL=configLoader.d.ts.map