import { ADOClient } from './adoClient';
import { GitManager } from './gitManager';
import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';
export interface DiffHunk {
    filePath: string;
    changeType: 'add' | 'edit' | 'delete' | 'rename';
    oldLineStart: number;
    oldLineCount: number;
    newLineStart: number;
    newLineCount: number;
    content: string;
    context: string;
}
export interface FileDiff {
    filePath: string;
    changeType: 'add' | 'edit' | 'delete' | 'rename';
    oldPath?: string;
    hunks: DiffHunk[];
    isText: boolean;
    isBinary: boolean;
}
export interface PullRequestDiff {
    pullRequestId: number;
    sourceCommit: string;
    targetCommit: string;
    files: FileDiff[];
    totalChanges: number;
    addedLines: number;
    deletedLines: number;
}
export declare class DiffFetcher {
    private adoClient;
    private gitManager;
    private logger;
    private errorHandler;
    constructor(adoClient: ADOClient, gitManager: GitManager, logger: Logger, errorHandler: ErrorHandler);
    /**
     * Fetch pull request diff using iteration changes API
     */
    fetchPullRequestDiff(pullRequestId: number, workingDirectory?: string): Promise<PullRequestDiff>;
    /**
     * Process individual file change
     */
    private processFileChange;
    /**
     * Map ADO change type to our change type
     */
    private mapChangeType;
    /**
     * Check if file is binary based on extension
     */
    private isBinaryFile;
    /**
     * Create basic diff representation when git is not available
     */
    /**
     * Create real diff using Azure DevOps API
     */
    private createRealDiff;
    /**
     * Generate unified diff format
     */
    private generateUnifiedDiff;
    private createBasicDiff;
    /**
     * Parse diff content into hunks
     */
    private parseDiffHunks;
    /**
     * Determine hunk change type based on content
     */
    private determineHunkChangeType;
    /**
     * Filter diffs based on file patterns
     */
    filterDiffs(pullRequestDiff: PullRequestDiff, includePatterns?: string[], excludePatterns?: string[], specificFiles?: string[]): PullRequestDiff;
    /**
     * Get summary of changes
     */
    getSummary(pullRequestDiff: PullRequestDiff): string;
}
//# sourceMappingURL=diffFetcher.d.ts.map