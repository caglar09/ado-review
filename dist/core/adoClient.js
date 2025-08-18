"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADOClient = void 0;
const axios_1 = __importDefault(require("axios"));
class ADOClient {
    constructor(organization, project, repository, personalAccessToken, logger, errorHandler) {
        this.organization = organization;
        this.project = project;
        this.repository = repository;
        this.logger = logger;
        this.errorHandler = errorHandler;
        this.client = axios_1.default.create({
            baseURL: `https://dev.azure.com/${organization}/${project}/_apis`,
            headers: {
                'Authorization': `Basic ${Buffer.from(`:${personalAccessToken}`).toString('base64')}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 60000, // Increased timeout to 60 seconds
            maxRedirects: 5,
            validateStatus: (status) => status < 500 // Don't throw on 4xx errors
        });
        // Add request/response interceptors for logging
        this.setupInterceptors();
    }
    /**
     * Get organization name
     */
    getOrganization() {
        return this.organization;
    }
    /**
     * Get project name
     */
    getProject() {
        return this.project;
    }
    /**
     * Get repository name
     */
    getRepository() {
        return this.repository;
    }
    /**
     * Get pull request information
     */
    async getPullRequest(pullRequestId) {
        try {
            this.logger.debug(`Fetching PR ${pullRequestId} info`);
            const response = await this.client.get(`/git/repositories/${this.repository}/pullrequests/${pullRequestId}`, {
                params: {
                    'api-version': '7.0'
                }
            });
            this.logger.debug(`Successfully fetched PR ${pullRequestId} info`);
            this.logger.debug(`Response status: ${response.status}`);
            this.logger.debug(`Response data keys:`, Object.keys(response.data || {}));
            this.logger.debug(`PR Info structure:`, JSON.stringify(response.data, null, 2));
            return response.data;
        }
        catch (error) {
            this.logger.error(`Error in getPullRequest:`, {
                status: error.response?.status,
                statusText: error.response?.statusText,
                message: error.message,
                code: error.code
            });
            throw this.errorHandler.createFromHttpResponse({
                status: error.response?.status || 500,
                statusText: error.response?.statusText || 'Unknown Error',
                data: error.response?.data
            }, {
                operation: 'getPullRequest',
                component: 'ADOClient',
                metadata: { pullRequestId }
            });
        }
    }
    /**
     * Get pull request iterations
     */
    async getPullRequestIterations(pullRequestId) {
        try {
            this.logger.debug(`Fetching PR ${pullRequestId} iterations`);
            const response = await this.client.get(`/git/repositories/${this.repository}/pullrequests/${pullRequestId}/iterations`, {
                params: {
                    'api-version': '7.0'
                }
            });
            this.logger.debug(`Successfully fetched ${response.data.value.length} iterations`);
            return response.data.value;
        }
        catch (error) {
            throw this.errorHandler.createFromHttpResponse({
                status: error.response?.status || 500,
                statusText: error.response?.statusText || 'Unknown Error',
                data: error.response?.data
            }, {
                operation: 'getPullRequestIterations',
                component: 'ADOClient',
                metadata: { pullRequestId }
            });
        }
    }
    /**
     * Get changes between iterations
     */
    async getIterationChanges(pullRequestId, iterationId, baseIterationId) {
        try {
            this.logger.debug(`Fetching changes for iteration ${iterationId}`);
            const params = {
                'api-version': '7.0'
            };
            if (baseIterationId) {
                params['$compareVersion'] = baseIterationId;
            }
            const response = await this.client.get(`/git/repositories/${this.repository}/pullrequests/${pullRequestId}/iterations/${iterationId}/changes`, { params });
            this.logger.debug(`Successfully fetched ${response.data.changeEntries.length} changes`);
            return response.data.changeEntries;
        }
        catch (error) {
            throw this.errorHandler.createFromHttpResponse({
                status: error.response?.status || 500,
                statusText: error.response?.statusText || 'Unknown Error',
                data: error.response?.data
            }, {
                operation: 'getIterationChanges',
                component: 'ADOClient',
                metadata: { pullRequestId, iterationId, baseIterationId }
            });
        }
    }
    /**
     * Create comment thread on pull request
     */
    async createCommentThread(pullRequestId, threadOrFilePath, line, comment) {
        try {
            let requestBody;
            if (typeof threadOrFilePath === 'string') {
                // Legacy mode: filePath, line, comment parameters
                if (!line || !comment) {
                    throw new Error('line and comment parameters are required when using string filePath');
                }
                this.logger.debug(`Creating comment thread on ${threadOrFilePath}:${line}`);
                requestBody = {
                    comments: [{
                            parentCommentId: 0,
                            content: comment,
                            commentType: 'text'
                        }],
                    status: 'active',
                    threadContext: {
                        filePath: threadOrFilePath,
                        rightFileStart: {
                            line: line,
                            offset: 1
                        },
                        rightFileEnd: {
                            line: line,
                            offset: 1
                        }
                    }
                };
            }
            else {
                // New mode: ADOCommentThread object
                this.logger.debug(`Creating comment thread from ADOCommentThread object`);
                requestBody = threadOrFilePath;
            }
            const response = await this.client.post(`/git/repositories/${this.repository}/pullrequests/${pullRequestId}/threads`, requestBody, {
                params: {
                    'api-version': '7.0'
                }
            });
            this.logger.debug(`Successfully created comment thread ${response.data.id}`);
            return response.data;
        }
        catch (error) {
            throw this.errorHandler.createFromHttpResponse({
                status: error.response?.status || 500,
                statusText: error.response?.statusText || 'Unknown Error',
                data: error.response?.data
            }, {
                operation: 'createCommentThread',
                component: 'ADOClient',
                metadata: {
                    pullRequestId,
                    threadOrFilePath: typeof threadOrFilePath === 'string' ? threadOrFilePath : 'ADOCommentThread',
                    line
                }
            });
        }
    }
    /**
     * Create pull request status
     */
    async createPullRequestStatus(pullRequestId, status) {
        try {
            this.logger.debug(`Creating PR ${pullRequestId} status: ${status.state}`);
            const response = await this.client.post(`/git/repositories/${this.repository}/pullrequests/${pullRequestId}/statuses`, status, {
                params: {
                    'api-version': '7.0'
                }
            });
            this.logger.debug(`Successfully created PR status`);
            return response.data;
        }
        catch (error) {
            throw this.errorHandler.createFromHttpResponse({
                status: error.response?.status || 500,
                statusText: error.response?.statusText || 'Unknown Error',
                data: error.response?.data
            }, {
                operation: 'createPullRequestStatus',
                component: 'ADOClient',
                metadata: { pullRequestId, status: status.state }
            });
        }
    }
    /**
     * Update pull request status
     */
    async updatePullRequestStatus(pullRequestId, statusId, status, description) {
        try {
            this.logger.debug(`Updating PR ${pullRequestId} status to ${status}`);
            const requestBody = {
                state: status,
                description: description || `ADO Review CLI - ${status}`,
                context: {
                    name: 'ado-review-cli',
                    genre: 'continuous-integration'
                }
            };
            const response = await this.client.patch(`/git/repositories/${this.repository}/pullrequests/${pullRequestId}/statuses/${statusId}`, requestBody, {
                params: {
                    'api-version': '7.0'
                }
            });
            this.logger.debug(`Successfully updated PR status`);
            return response.data;
        }
        catch (error) {
            throw this.errorHandler.createFromHttpResponse({
                status: error.response?.status || 500,
                statusText: error.response?.statusText || 'Unknown Error',
                data: error.response?.data
            }, {
                operation: 'updatePullRequestStatus',
                component: 'ADOClient',
                metadata: { pullRequestId, status }
            });
        }
    }
    /**
     * Add comment to existing thread
     */
    async addCommentToThread(pullRequestId, threadId, comment) {
        try {
            this.logger.debug(`Adding comment to thread ${threadId}`);
            const requestBody = {
                content: comment.content,
                commentType: comment.commentType || 'text',
                parentCommentId: 0
            };
            await this.client.post(`/git/repositories/${this.repository}/pullrequests/${pullRequestId}/threads/${threadId}/comments`, requestBody, {
                params: {
                    'api-version': '7.0'
                }
            });
            this.logger.debug(`Successfully added comment to thread ${threadId}`);
        }
        catch (error) {
            throw this.errorHandler.createFromHttpResponse({
                status: error.response?.status || 500,
                statusText: error.response?.statusText || 'Unknown Error',
                data: error.response?.data
            }, {
                operation: 'addCommentToThread',
                component: 'ADOClient',
                metadata: { pullRequestId, threadId }
            });
        }
    }
    /**
     * Get pull request statuses
     */
    async getPullRequestStatuses(pullRequestId, iterationId) {
        try {
            this.logger.debug(`Getting PR ${pullRequestId} statuses`);
            const response = await this.client.get(`/git/repositories/${this.repository}/pullrequests/${pullRequestId}/statuses`, {
                params: {
                    'api-version': '7.0',
                    ...(iterationId && { iterationId })
                }
            });
            this.logger.debug(`Successfully retrieved PR statuses`);
            return response.data.value || [];
        }
        catch (error) {
            throw this.errorHandler.createFromHttpResponse({
                status: error.response?.status || 500,
                statusText: error.response?.statusText || 'Unknown Error',
                data: error.response?.data
            }, {
                operation: 'getPullRequestStatuses',
                component: 'ADOClient',
                metadata: { pullRequestId, iterationId }
            });
        }
    }
    /**
     * Get file content from repository at specific commit
     */
    async getFileContent(filePath, commitId) {
        try {
            this.logger.debug(`Fetching file content: ${filePath} at commit ${commitId}`);
            const response = await this.client.get(`/git/repositories/${this.repository}/items`, {
                params: {
                    'api-version': '7.0',
                    'path': filePath,
                    'versionDescriptor.version': commitId,
                    'versionDescriptor.versionType': 'commit',
                    'includeContent': true
                },
                responseType: 'text'
            });
            this.logger.debug(`Successfully fetched file content for ${filePath}`);
            return response.data;
        }
        catch (error) {
            if (error.response?.status === 404) {
                this.logger.debug(`File not found: ${filePath} at commit ${commitId}`);
                return ''; // Return empty string for non-existent files
            }
            throw this.errorHandler.createFromHttpResponse({
                status: error.response?.status || 500,
                statusText: error.response?.statusText || 'Unknown Error',
                data: error.response?.data
            }, {
                operation: 'getFileContent',
                component: 'ADOClient',
                metadata: { filePath, commitId }
            });
        }
    }
    /**
     * Get existing comment threads
     */
    async getCommentThreads(pullRequestId) {
        try {
            this.logger.debug(`Fetching comment threads for PR ${pullRequestId}`);
            const response = await this.client.get(`/git/repositories/${this.repository}/pullrequests/${pullRequestId}/threads`, {
                params: {
                    'api-version': '7.0'
                }
            });
            this.logger.debug(`Successfully fetched ${response.data.value.length} comment threads`);
            return response.data.value;
        }
        catch (error) {
            throw this.errorHandler.createFromHttpResponse({
                status: error.response?.status || 500,
                statusText: error.response?.statusText || 'Unknown Error',
                data: error.response?.data
            }, {
                operation: 'getCommentThreads',
                component: 'ADOClient',
                metadata: { pullRequestId }
            });
        }
    }
    /**
     * Setup request/response interceptors
     */
    setupInterceptors() {
        // Request interceptor
        this.client.interceptors.request.use((config) => {
            this.logger.debug(`Making ${config.method?.toUpperCase()} request to ${config.url}`);
            // Initialize retry count
            config.metadata = { retryCount: 0 };
            return config;
        }, (error) => {
            this.logger.error(`Request error: ${error.message}`);
            return Promise.reject(error);
        });
        // Response interceptor with retry logic
        this.client.interceptors.response.use((response) => {
            this.logger.debug(`Received ${response.status} response from ${response.config.url}`);
            // Check for authentication errors even in "successful" responses
            if (response.status === 401) {
                this.logger.error(`Authentication failed (401) for ${response.config.url}`);
                const error = new Error('Authentication failed');
                error.response = response;
                throw error;
            }
            return response;
        }, async (error) => {
            const config = error.config;
            const status = error.response?.status;
            const url = config?.url;
            const retryCount = config?.metadata?.retryCount || 0;
            const maxRetries = 3;
            // Check if we should retry
            const shouldRetry = ((error.code === 'EPIPE' || error.code === 'ECONNRESET' ||
                status === 429 || status >= 500) &&
                retryCount < maxRetries);
            if (shouldRetry) {
                config.metadata.retryCount = retryCount + 1;
                const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
                this.logger.warn(`HTTP ${status || error.code} error from ${url}: ${error.message}. Retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.client(config);
            }
            this.logger.error(`HTTP ${status || error.code} error from ${url}: ${error.message}`);
            return Promise.reject(error);
        });
    }
}
exports.ADOClient = ADOClient;
//# sourceMappingURL=adoClient.js.map