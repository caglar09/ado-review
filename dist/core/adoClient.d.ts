import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';
import { ADOCommentThread } from './resultMapper';
declare module 'axios' {
    interface AxiosRequestConfig {
        metadata?: {
            retryCount: number;
        };
    }
}
export interface PullRequestInfo {
    pullRequestId: number;
    title: string;
    description: string;
    sourceRefName: string;
    targetRefName: string;
    repository: {
        id: string;
        name: string;
        remoteUrl: string;
        project: {
            id: string;
            name: string;
        };
    };
    createdBy: {
        displayName: string;
        uniqueName: string;
    };
    status: string;
    isDraft: boolean;
}
export interface PullRequestIteration {
    id: number;
    description: string;
    author: {
        displayName: string;
    };
    createdDate: string;
    updatedDate: string;
    sourceRefCommit: {
        commitId: string;
    };
    targetRefCommit: {
        commitId: string;
    };
}
export interface FileChange {
    changeType: string;
    item: {
        path: string;
        isFolder: boolean;
    };
}
export interface CommentThread {
    id: number;
    status: string;
    context: {
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
    comments: Array<{
        id: number;
        content: string;
        author: {
            displayName: string;
        };
    }>;
}
export declare class ADOClient {
    private client;
    private logger;
    private errorHandler;
    private organization;
    private project;
    private repository;
    constructor(organization: string, project: string, repository: string, personalAccessToken: string, logger: Logger, errorHandler: ErrorHandler);
    /**
     * Get organization name
     */
    getOrganization(): string;
    /**
     * Get project name
     */
    getProject(): string;
    /**
     * Get repository name
     */
    getRepository(): string;
    /**
     * Get pull request information
     */
    getPullRequest(pullRequestId: number): Promise<PullRequestInfo>;
    /**
     * Get pull request iterations
     */
    getPullRequestIterations(pullRequestId: number): Promise<PullRequestIteration[]>;
    /**
     * Get changes between iterations
     */
    getIterationChanges(pullRequestId: number, iterationId: number, baseIterationId?: number): Promise<FileChange[]>;
    /**
     * Create comment thread on pull request
     */
    createCommentThread(pullRequestId: number, threadOrFilePath: ADOCommentThread | string, line?: number, comment?: string): Promise<CommentThread>;
    /**
     * Create pull request status
     */
    createPullRequestStatus(pullRequestId: number, status: {
        state: string;
        description: string;
        context?: any;
    }): Promise<any>;
    /**
     * Update pull request status
     */
    updatePullRequestStatus(pullRequestId: number, statusId: string, status: 'pending' | 'succeeded' | 'failed' | 'error', description?: string): Promise<any>;
    /**
     * Add comment to existing thread
     */
    addCommentToThread(pullRequestId: number, threadId: number, comment: {
        content: string;
        commentType?: string;
    }): Promise<void>;
    /**
     * Get pull request statuses
     */
    getPullRequestStatuses(pullRequestId: number, iterationId?: number): Promise<any[]>;
    /**
     * Get final diff between source and target commits of a PR
     * This returns only the net changes after all commits are applied
     */
    getPullRequestFinalDiff(pullRequestId: number): Promise<any>;
    /**
     * Get file content from repository at specific commit
     */
    getFileContent(filePath: string, commitId: string): Promise<string>;
    /**
     * Get existing comment threads
     */
    getCommentThreads(pullRequestId: number): Promise<CommentThread[]>;
    /**
     * Approve a pull request by casting a vote
     * @param pullRequestId - The ID of the pull request
     * @param reviewerId - The ID of the reviewer (current user)
     * @returns Promise<void>
     */
    approvePullRequest(pullRequestId: number, reviewerId: string): Promise<void>;
    /**
     * Get current user information to use as reviewer ID
     * @returns Promise<string> - The current user's ID
     */
    getCurrentUserId(): Promise<string>;
    /**
     * Setup request/response interceptors
     */
    private setupInterceptors;
}
//# sourceMappingURL=adoClient.d.ts.map