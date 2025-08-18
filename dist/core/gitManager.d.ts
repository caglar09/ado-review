import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';
export interface CloneOptions {
    branch: string;
    depth?: number;
    sparseCheckout?: string[];
    workingDirectory: string;
}
export interface GitInfo {
    repositoryUrl: string;
    branch: string;
    commitId: string;
    workingDirectory: string;
}
export declare class GitManager {
    private logger;
    private errorHandler;
    constructor(logger: Logger, errorHandler: ErrorHandler);
    /**
     * Clone repository with sparse checkout
     */
    cloneRepository(repositoryUrl: string, options: CloneOptions): Promise<GitInfo>;
    /**
     * Get file content at specific commit
     */
    getFileContent(workingDirectory: string, filePath: string, commitId?: string): Promise<string>;
    /**
     * Get diff between commits
     */
    getDiff(workingDirectory: string, fromCommit: string, toCommit: string, filePath?: string): Promise<string>;
    /**
     * Get list of changed files between commits
     */
    getChangedFiles(workingDirectory: string, fromCommit: string, toCommit: string): Promise<string[]>;
    /**
     * Check if git is available
     */
    checkGitAvailability(): boolean;
    /**
     * Clean up working directory
     */
    cleanup(workingDirectory: string): Promise<void>;
    /**
     * Get repository information
     */
    getRepositoryInfo(workingDirectory: string): Promise<{
        remoteUrl: string;
        currentBranch: string;
        currentCommit: string;
    }>;
    /**
     * Execute git command synchronously
     */
    private executeGitCommand;
    /**
     * Filter files based on patterns
     */
    filterFiles(files: string[], includePatterns?: string[], excludePatterns?: string[]): string[];
    /**
     * Simple pattern matching (supports * wildcard)
     */
    private matchesPattern;
}
//# sourceMappingURL=gitManager.d.ts.map