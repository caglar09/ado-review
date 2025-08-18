import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';
import { ADOCommentThread } from './resultMapper';

// Extend AxiosRequestConfig to include metadata
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

export class ADOClient {
  private client: AxiosInstance;
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private organization: string;
  private project: string;
  private repository: string;

  constructor(
    organization: string,
    project: string,
    repository: string,
    personalAccessToken: string,
    logger: Logger,
    errorHandler: ErrorHandler
  ) {
    this.organization = organization;
    this.project = project;
    this.repository = repository;
    this.logger = logger;
    this.errorHandler = errorHandler;

    this.client = axios.create({
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
  public getOrganization(): string {
    return this.organization;
  }

  /**
   * Get project name
   */
  public getProject(): string {
    return this.project;
  }

  /**
   * Get repository name
   */
  public getRepository(): string {
    return this.repository;
  }

  /**
   * Get pull request information
   */
  public async getPullRequest(pullRequestId: number): Promise<PullRequestInfo> {
    try {
      this.logger.debug(`Fetching PR ${pullRequestId} info`);
      
      const response: AxiosResponse<PullRequestInfo> = await this.client.get(
        `/git/repositories/${this.repository}/pullrequests/${pullRequestId}`,
        {
          params: {
            'api-version': '7.0'
          }
        }
      );

      this.logger.debug(`Successfully fetched PR ${pullRequestId} info`);
      this.logger.debug(`Response status: ${response.status}`);
      this.logger.debug(`Response data keys:`, Object.keys(response.data || {}));
      this.logger.debug(`PR Info structure:`, JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      this.logger.error(`Error in getPullRequest:`, {
        status: (error as any).response?.status,
        statusText: (error as any).response?.statusText,
        message: (error as any).message,
        code: (error as any).code
      });
      throw this.errorHandler.createFromHttpResponse(
        {
          status: (error as any).response?.status || 500,
          statusText: (error as any).response?.statusText || 'Unknown Error',
          data: (error as any).response?.data
        },
        {
          operation: 'getPullRequest',
          component: 'ADOClient',
          metadata: { pullRequestId }
        }
      );
    }
  }

  /**
   * Get pull request iterations
   */
  public async getPullRequestIterations(pullRequestId: number): Promise<PullRequestIteration[]> {
    try {
      this.logger.debug(`Fetching PR ${pullRequestId} iterations`);
      
      const response: AxiosResponse<{ value: PullRequestIteration[] }> = await this.client.get(
        `/git/repositories/${this.repository}/pullrequests/${pullRequestId}/iterations`,
        {
          params: {
            'api-version': '7.0'
          }
        }
      );

      this.logger.debug(`Successfully fetched ${response.data.value.length} iterations`);
      return response.data.value;
    } catch (error) {
      throw this.errorHandler.createFromHttpResponse(
        {
          status: (error as any).response?.status || 500,
          statusText: (error as any).response?.statusText || 'Unknown Error',
          data: (error as any).response?.data
        },
        {
          operation: 'getPullRequestIterations',
          component: 'ADOClient',
          metadata: { pullRequestId }
        }
      );
    }
  }

  /**
   * Get changes between iterations
   */
  public async getIterationChanges(
    pullRequestId: number,
    iterationId: number,
    baseIterationId?: number
  ): Promise<FileChange[]> {
    try {
      this.logger.debug(`Fetching changes for iteration ${iterationId}`);
      
      const params: any = {
        'api-version': '7.0'
      };
      
      if (baseIterationId) {
        params['$compareVersion'] = baseIterationId;
      }

      const response: AxiosResponse<{ changeEntries: FileChange[] }> = await this.client.get(
        `/git/repositories/${this.repository}/pullrequests/${pullRequestId}/iterations/${iterationId}/changes`,
        { params }
      );

      this.logger.debug(`Successfully fetched ${response.data.changeEntries.length} changes`);
      return response.data.changeEntries;
    } catch (error) {
      throw this.errorHandler.createFromHttpResponse(
        {
          status: (error as any).response?.status || 500,
          statusText: (error as any).response?.statusText || 'Unknown Error',
          data: (error as any).response?.data
        },
        {
          operation: 'getIterationChanges',
          component: 'ADOClient',
          metadata: { pullRequestId, iterationId, baseIterationId }
        }
      );
    }
  }

  /**
   * Create comment thread on pull request
   */
  public async createCommentThread(
    pullRequestId: number,
    threadOrFilePath: ADOCommentThread | string,
    line?: number,
    comment?: string
  ): Promise<CommentThread> {
    try {
      let requestBody: any;
      
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
      } else {
        // New mode: ADOCommentThread object
        this.logger.debug(`Creating comment thread from ADOCommentThread object`);
        requestBody = threadOrFilePath;
      }

      const response: AxiosResponse<CommentThread> = await this.client.post(
        `/git/repositories/${this.repository}/pullrequests/${pullRequestId}/threads`,
        requestBody,
        {
          params: {
            'api-version': '7.0'
          }
        }
      );

      this.logger.debug(`Successfully created comment thread ${response.data.id}`);
      return response.data;
    } catch (error) {
      throw this.errorHandler.createFromHttpResponse(
        {
          status: (error as any).response?.status || 500,
          statusText: (error as any).response?.statusText || 'Unknown Error',
          data: (error as any).response?.data
        },
        {
          operation: 'createCommentThread',
          component: 'ADOClient',
          metadata: { 
            pullRequestId, 
            threadOrFilePath: typeof threadOrFilePath === 'string' ? threadOrFilePath : 'ADOCommentThread',
            line 
          }
        }
      );
    }
  }

  /**
   * Create pull request status
   */
  public async createPullRequestStatus(
    pullRequestId: number,
    status: { state: string; description: string; context?: any }
  ): Promise<any> {
    try {
      this.logger.debug(`Creating PR ${pullRequestId} status: ${status.state}`);
      
      const response = await this.client.post(
        `/git/repositories/${this.repository}/pullrequests/${pullRequestId}/statuses`,
        status,
        {
          params: {
            'api-version': '7.0'
          }
        }
      );

      this.logger.debug(`Successfully created PR status`);
      return response.data;
    } catch (error) {
      throw this.errorHandler.createFromHttpResponse(
        {
          status: (error as any).response?.status || 500,
          statusText: (error as any).response?.statusText || 'Unknown Error',
          data: (error as any).response?.data
        },
        {
          operation: 'createPullRequestStatus',
          component: 'ADOClient',
          metadata: { pullRequestId, status: status.state }
        }
      );
    }
  }

  /**
   * Update pull request status
   */
  public async updatePullRequestStatus(
    pullRequestId: number,
    statusId: string,
    status: 'pending' | 'succeeded' | 'failed' | 'error',
    description?: string
  ): Promise<any> {
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

      const response = await this.client.patch(
        `/git/repositories/${this.repository}/pullrequests/${pullRequestId}/statuses/${statusId}`,
        requestBody,
        {
          params: {
            'api-version': '7.0'
          }
        }
      );

      this.logger.debug(`Successfully updated PR status`);
      return response.data;
    } catch (error) {
      throw this.errorHandler.createFromHttpResponse(
        {
          status: (error as any).response?.status || 500,
          statusText: (error as any).response?.statusText || 'Unknown Error',
          data: (error as any).response?.data
        },
        {
          operation: 'updatePullRequestStatus',
          component: 'ADOClient',
          metadata: { pullRequestId, status }
        }
      );
    }
  }

  /**
   * Add comment to existing thread
   */
  public async addCommentToThread(
    pullRequestId: number,
    threadId: number,
    comment: { content: string; commentType?: string }
  ): Promise<void> {
    try {
      this.logger.debug(`Adding comment to thread ${threadId}`);
      
      const requestBody = {
        content: comment.content,
        commentType: comment.commentType || 'text',
        parentCommentId: 0
      };

      await this.client.post(
        `/git/repositories/${this.repository}/pullrequests/${pullRequestId}/threads/${threadId}/comments`,
        requestBody,
        {
          params: {
            'api-version': '7.0'
          }
        }
      );

      this.logger.debug(`Successfully added comment to thread ${threadId}`);
    } catch (error) {
      throw this.errorHandler.createFromHttpResponse(
        {
          status: (error as any).response?.status || 500,
          statusText: (error as any).response?.statusText || 'Unknown Error',
          data: (error as any).response?.data
        },
        {
          operation: 'addCommentToThread',
          component: 'ADOClient',
          metadata: { pullRequestId, threadId }
        }
      );
    }
  }

  /**
   * Get pull request statuses
   */
  public async getPullRequestStatuses(
    pullRequestId: number,
    iterationId?: number
  ): Promise<any[]> {
    try {
      this.logger.debug(`Getting PR ${pullRequestId} statuses`);
      
      const response = await this.client.get(
        `/git/repositories/${this.repository}/pullrequests/${pullRequestId}/statuses`,
        {
          params: {
            'api-version': '7.0',
            ...(iterationId && { iterationId })
          }
        }
      );

      this.logger.debug(`Successfully retrieved PR statuses`);
      return response.data.value || [];
    } catch (error) {
      throw this.errorHandler.createFromHttpResponse(
        {
          status: (error as any).response?.status || 500,
          statusText: (error as any).response?.statusText || 'Unknown Error',
          data: (error as any).response?.data
        },
        {
          operation: 'getPullRequestStatuses',
          component: 'ADOClient',
          metadata: { pullRequestId, iterationId }
        }
      );
    }
  }

  /**
   * Get file content from repository at specific commit
   */
  public async getFileContent(
    filePath: string,
    commitId: string
  ): Promise<string> {
    try {
      this.logger.debug(`Fetching file content: ${filePath} at commit ${commitId}`);
      
      const response: AxiosResponse<string> = await this.client.get(
        `/git/repositories/${this.repository}/items`,
        {
          params: {
            'api-version': '7.0',
            'path': filePath,
            'versionDescriptor.version': commitId,
            'versionDescriptor.versionType': 'commit',
            'includeContent': true
          },
          responseType: 'text'
        }
      );

      this.logger.debug(`Successfully fetched file content for ${filePath}`);
      return response.data;
    } catch (error) {
      if ((error as any).response?.status === 404) {
        this.logger.debug(`File not found: ${filePath} at commit ${commitId}`);
        return ''; // Return empty string for non-existent files
      }
      
      throw this.errorHandler.createFromHttpResponse(
        {
          status: (error as any).response?.status || 500,
          statusText: (error as any).response?.statusText || 'Unknown Error',
          data: (error as any).response?.data
        },
        {
          operation: 'getFileContent',
          component: 'ADOClient',
          metadata: { filePath, commitId }
        }
      );
    }
  }

  /**
   * Get existing comment threads
   */
  public async getCommentThreads(pullRequestId: number): Promise<CommentThread[]> {
    try {
      this.logger.debug(`Fetching comment threads for PR ${pullRequestId}`);
      
      const response: AxiosResponse<{ value: CommentThread[] }> = await this.client.get(
        `/git/repositories/${this.repository}/pullrequests/${pullRequestId}/threads`,
        {
          params: {
            'api-version': '7.0'
          }
        }
      );

      this.logger.debug(`Successfully fetched ${response.data.value.length} comment threads`);
      return response.data.value;
    } catch (error) {
      throw this.errorHandler.createFromHttpResponse(
        {
          status: (error as any).response?.status || 500,
          statusText: (error as any).response?.statusText || 'Unknown Error',
          data: (error as any).response?.data
        },
        {
          operation: 'getCommentThreads',
          component: 'ADOClient',
          metadata: { pullRequestId }
        }
      );
    }
  }

  /**
   * Setup request/response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        this.logger.debug(`Making ${config.method?.toUpperCase()} request to ${config.url}`);
        // Initialize retry count
        config.metadata = { retryCount: 0 };
        return config;
      },
      (error) => {
        this.logger.error(`Request error: ${error.message}`);
        return Promise.reject(error);
      }
    );

    // Response interceptor with retry logic
    this.client.interceptors.response.use(
      (response) => {
        this.logger.debug(`Received ${response.status} response from ${response.config.url}`);
        
        // Check for authentication errors even in "successful" responses
        if (response.status === 401) {
          this.logger.error(`Authentication failed (401) for ${response.config.url}`);
          const error = new Error('Authentication failed');
          (error as any).response = response;
          throw error;
        }
        
        return response;
      },
      async (error) => {
        const config = error.config;
        const status = error.response?.status;
        const url = config?.url;
        const retryCount = config?.metadata?.retryCount || 0;
        const maxRetries = 3;
        
        // Check if we should retry
        const shouldRetry = (
          (error.code === 'EPIPE' || error.code === 'ECONNRESET' || 
           status === 429 || status >= 500) &&
          retryCount < maxRetries
        );
        
        if (shouldRetry) {
          config.metadata.retryCount = retryCount + 1;
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
          
          this.logger.warn(`HTTP ${status || error.code} error from ${url}: ${error.message}. Retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.client(config);
        }
        
        this.logger.error(`HTTP ${status || error.code} error from ${url}: ${error.message}`);
        return Promise.reject(error);
      }
    );
  }
}