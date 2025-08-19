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
     * This gets the changes from the PR iterations which matches the manual API data
     */
    fetchPullRequestDiff(pullRequestId: number, workingDirectory?: string): Promise<PullRequestDiff>;
    /**
     * Process individual file change from iteration changes
     */
    private processIterationChange;
    private mapChangeType;
    private isBinaryFile;
    private createBasicDiff;
    private parseDiffHunks;
    private determineHunkChangeType;
    filterDiffs(pullRequestDiff: PullRequestDiff, _includePatterns?: string[], _excludePatterns?: string[], specificFiles?: string[]): PullRequestDiff;
    getSummary(pullRequestDiff: PullRequestDiff): string;
}
//# sourceMappingURL=diffFetcher.d.ts.map