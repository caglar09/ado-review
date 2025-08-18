import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';
import { ADOClient } from './adoClient';
import { ADOComment, ADOCommentThread, MappingResult } from './resultMapper';

export interface CommentOptions {
  dryRun: boolean;
  batchSize: number;
  delayBetweenBatches: number;
  retryAttempts: number;
  retryDelay: number;
  skipExistingComments: boolean;
  updateExistingComments: boolean;
  maxCommentsPerRequest: number;
}

export interface CommentResult {
  success: boolean;
  threadsCreated: number;
  threadsUpdated: number;
  threadsSkipped: number;
  commentsCreated: number;
  commentsUpdated: number;
  errors: string[];
  warnings: string[];
}

export interface ExistingThread {
  id: number;
  threadContext?: {
    filePath: string;
    rightFileStart: { line: number; offset: number };
    rightFileEnd: { line: number; offset: number };
  };
  comments: Array<{
    id: number;
    content: string;
    properties?: Record<string, any>;
  }>;
  properties?: Record<string, any>;
}

export class Commenter {
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private adoClient: ADOClient;
  private defaultOptions: CommentOptions;

  constructor(logger: Logger, errorHandler: ErrorHandler, adoClient: ADOClient) {
    this.logger = logger;
    this.errorHandler = errorHandler;
    this.adoClient = adoClient;
    this.defaultOptions = {
      dryRun: false,
      batchSize: 5,
      delayBetweenBatches: 1000,
      retryAttempts: 3,
      retryDelay: 2000,
      skipExistingComments: true,
      updateExistingComments: false,
      maxCommentsPerRequest: 10
    };
  }

  /**
   * Post comment threads to Azure DevOps
   */
  public async postComments(
    pullRequestId: number,
    mappingResult: MappingResult,
    options: Partial<CommentOptions> = {}
  ): Promise<CommentResult> {
    try {
      const opts = { ...this.defaultOptions, ...options };
      const { threads, summaryComment } = mappingResult;
      
      this.logger.info(`Posting ${threads.length} comment threads to PR ${pullRequestId}`);
      
      if (opts.dryRun) {
        return this.simulatePosting(threads, summaryComment);
      }
      
      const result: CommentResult = {
        success: true,
        threadsCreated: 0,
        threadsUpdated: 0,
        threadsSkipped: 0,
        commentsCreated: 0,
        commentsUpdated: 0,
        errors: [],
        warnings: []
      };
      
      // Get existing threads if we need to check for duplicates
      let existingThreads: ExistingThread[] = [];
      if (opts.skipExistingComments || opts.updateExistingComments) {
        existingThreads = await this.getExistingThreads(pullRequestId);
        this.logger.debug(`Found ${existingThreads.length} existing comment threads`);
      }
      
      // Process threads in batches
      const batches = this.createBatches(threads, opts.batchSize);
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        if (!batch) continue;
        
        this.logger.debug(`Processing batch ${i + 1}/${batches.length} (${batch.length} threads)`);
        
        try {
          const batchResult = await this.processBatch(
            pullRequestId,
            batch,
            existingThreads,
            opts
          );
          
          // Merge batch results
          result.threadsCreated += batchResult.threadsCreated;
          result.threadsUpdated += batchResult.threadsUpdated;
          result.threadsSkipped += batchResult.threadsSkipped;
          result.commentsCreated += batchResult.commentsCreated;
          result.commentsUpdated += batchResult.commentsUpdated;
          result.errors.push(...batchResult.errors);
          result.warnings.push(...batchResult.warnings);
          
        } catch (error) {
          const errorMsg = `Batch ${i + 1} failed: ${(error as Error).message}`;
          this.logger.error(errorMsg);
          result.errors.push(errorMsg);
          result.success = false;
        }
        
        // Delay between batches (except for the last one)
        if (i < batches.length - 1 && opts.delayBetweenBatches > 0) {
          await this.delay(opts.delayBetweenBatches);
        }
      }
      
      // Post summary comment if provided
      if (summaryComment) {
        try {
          await this.postSummaryComment(pullRequestId, summaryComment, opts);
          result.commentsCreated++;
        } catch (error) {
          const errorMsg = `Failed to post summary comment: ${(error as Error).message}`;
          this.logger.error(errorMsg);
          result.errors.push(errorMsg);
        }
      }
      
      this.logger.info(`Comment posting completed: ${result.threadsCreated} threads created, ${result.commentsCreated} comments created`);
      
      return result;
    } catch (error) {
      throw this.errorHandler.normalizeError(error as Error);
    }
  }

  /**
   * Simulate posting for dry run
   */
  private simulatePosting(
    threads: ADOCommentThread[],
    summaryComment?: ADOComment
  ): CommentResult {
    this.logger.info('DRY RUN: Simulating comment posting');
    
    const result: CommentResult = {
      success: true,
      threadsCreated: threads.length,
      threadsUpdated: 0,
      threadsSkipped: 0,
      commentsCreated: threads.reduce((sum, thread) => sum + thread.comments.length, 0),
      commentsUpdated: 0,
      errors: [],
      warnings: []
    };
    
    if (summaryComment) {
      result.commentsCreated++;
    }
    
    // Log what would be posted
    for (let i = 0; i < threads.length; i++) {
      const thread = threads[i];
      if (!thread) continue;
      
      const context = thread.threadContext;
      
      this.logger.info(
        `[DRY RUN] Thread ${i + 1}: ${context?.filePath}:${context?.rightFileStart.line} ` +
        `(${thread.comments.length} comments)`
      );
      
      for (let j = 0; j < thread.comments.length; j++) {
        const comment = thread.comments[j];
        if (!comment) continue;
        
        const preview = comment.content.substring(0, 100).replace(/\n/g, ' ');
        this.logger.debug(`[DRY RUN]   Comment ${j + 1}: ${preview}...`);
      }
    }
    
    if (summaryComment) {
      const preview = summaryComment.content.substring(0, 100).replace(/\n/g, ' ');
      this.logger.info(`[DRY RUN] Summary comment: ${preview}...`);
    }
    
    return result;
  }

  /**
   * Get existing comment threads
   */
  private async getExistingThreads(pullRequestId: number): Promise<ExistingThread[]> {
    try {
      const threads = await this.adoClient.getCommentThreads(pullRequestId);
      
      return threads.map(thread => ({
        id: thread.id!,
        threadContext: thread.context,
        comments: thread.comments.map(comment => ({
          id: comment.id!,
          content: comment.content
        }))
      }));
    } catch (error) {
      this.logger.warn(`Failed to get existing threads: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Create batches from threads
   */
  private createBatches(threads: ADOCommentThread[], batchSize: number): ADOCommentThread[][] {
    const batches: ADOCommentThread[][] = [];
    
    for (let i = 0; i < threads.length; i += batchSize) {
      batches.push(threads.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * Process a batch of threads
   */
  private async processBatch(
    pullRequestId: number,
    threads: ADOCommentThread[],
    existingThreads: ExistingThread[],
    options: CommentOptions
  ): Promise<CommentResult> {
    const result: CommentResult = {
      success: true,
      threadsCreated: 0,
      threadsUpdated: 0,
      threadsSkipped: 0,
      commentsCreated: 0,
      commentsUpdated: 0,
      errors: [],
      warnings: []
    };
    
    for (const thread of threads) {
      try {
        const existingThread = this.findExistingThread(thread, existingThreads);
        
        if (existingThread) {
          if (options.skipExistingComments) {
            this.logger.debug(`Skipping existing thread at ${thread.threadContext?.filePath}:${thread.threadContext?.rightFileStart.line}`);
            result.threadsSkipped++;
            continue;
          } else if (options.updateExistingComments) {
            await this.updateExistingThread(pullRequestId, existingThread, thread, options);
            result.threadsUpdated++;
            result.commentsUpdated += thread.comments.length;
          }
        } else {
          await this.createNewThread(pullRequestId, thread, options);
          result.threadsCreated++;
          result.commentsCreated += thread.comments.length;
        }
      } catch (error) {
        const errorMsg = `Failed to process thread: ${(error as Error).message}`;
        this.logger.error(errorMsg);
        result.errors.push(errorMsg);
        result.success = false;
      }
    }
    
    return result;
  }

  /**
   * Find existing thread that matches the new thread
   */
  private findExistingThread(
    newThread: ADOCommentThread,
    existingThreads: ExistingThread[]
  ): ExistingThread | undefined {
    const newContext = newThread.threadContext;
    if (!newContext) return undefined;
    
    return existingThreads.find(existing => {
      const existingContext = existing.threadContext;
      if (!existingContext) return false;
      
      // Match by file path and line range
      return (
        existingContext.filePath === newContext.filePath &&
        existingContext.rightFileStart.line === newContext.rightFileStart.line &&
        existingContext.rightFileEnd.line === newContext.rightFileEnd.line
      );
    });
  }

  /**
   * Create new comment thread
   */
  private async createNewThread(
    pullRequestId: number,
    thread: ADOCommentThread,
    options: CommentOptions
  ): Promise<void> {
    const context = thread.threadContext;
    this.logger.debug(`Creating new thread at ${context?.filePath}:${context?.rightFileStart.line}`);
    
    await this.retryOperation(
      () => this.adoClient.createCommentThread(pullRequestId, thread),
      options.retryAttempts,
      options.retryDelay,
      `create thread at ${context?.filePath}:${context?.rightFileStart.line}`
    );
  }

  /**
   * Update existing comment thread
   */
  private async updateExistingThread(
    pullRequestId: number,
    existingThread: ExistingThread,
    newThread: ADOCommentThread,
    options: CommentOptions
  ): Promise<void> {
    const context = newThread.threadContext;
    this.logger.debug(`Updating existing thread ${existingThread.id} at ${context?.filePath}:${context?.rightFileStart.line}`);
    
    // Add new comments to existing thread
    for (const comment of newThread.comments) {
      // Check if comment already exists (by content similarity)
      const isDuplicate = existingThread.comments.some(existing => 
        this.areCommentsSimilar(existing.content, comment.content)
      );
      
      if (!isDuplicate) {
        await this.retryOperation(
          () => this.adoClient.addCommentToThread(pullRequestId, existingThread.id, comment),
          options.retryAttempts,
          options.retryDelay,
          `add comment to thread ${existingThread.id}`
        );
      }
    }
  }

  /**
   * Check if two comments are similar (to avoid duplicates)
   */
  private areCommentsSimilar(content1: string, content2: string): boolean {
    // Simple similarity check - normalize whitespace and compare
    const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
    
    const normalized1 = normalize(content1);
    const normalized2 = normalize(content2);
    
    // Check for exact match or high similarity
    if (normalized1 === normalized2) {
      return true;
    }
    
    // Check for substantial overlap (80% similarity)
    const similarity = this.calculateSimilarity(normalized1, normalized2);
    return similarity > 0.8;
  }

  /**
   * Calculate text similarity (simple Jaccard similarity)
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(' '));
    const words2 = new Set(text2.split(' '));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Post summary comment
   */
  private async postSummaryComment(
    pullRequestId: number,
    summaryComment: ADOComment,
    options: CommentOptions
  ): Promise<void> {
    this.logger.debug('Posting summary comment');
    
    // Create a general thread for the summary comment (not tied to specific lines)
    const summaryThread: ADOCommentThread = {
      comments: [summaryComment],
      status: 'active',
      properties: {
        'ado-review.type': 'summary-thread'
      }
    };
    
    await this.retryOperation(
      () => this.adoClient.createCommentThread(pullRequestId, summaryThread),
      options.retryAttempts,
      options.retryDelay,
      'create summary comment thread'
    );
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxAttempts: number,
    baseDelay: number,
    operationName: string
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxAttempts) {
          throw lastError;
        }
        
        // Check if error is retryable
        if (!this.isRetryableError(lastError)) {
          throw lastError;
        }
        
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        this.logger.warn(`${operationName} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms: ${lastError.message}`);
        
        await this.delay(delay);
      }
    }
    
    throw lastError!;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Retryable conditions
    const retryablePatterns = [
      'timeout',
      'network',
      'connection',
      'rate limit',
      '429',
      '500',
      '502',
      '503',
      '504'
    ];
    
    return retryablePatterns.some(pattern => message.includes(pattern));
  }

  /**
   * Delay execution
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate comment thread before posting
   */
  public validateThread(thread: ADOCommentThread): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check comments
    if (!thread.comments || thread.comments.length === 0) {
      errors.push('Thread must have at least one comment');
    } else {
      for (let i = 0; i < thread.comments.length; i++) {
        const comment = thread.comments[i];
        if (!comment) {
          errors.push(`Comment ${i + 1} is undefined`);
          continue;
        }
        if (!comment.content || comment.content.trim().length === 0) {
          errors.push(`Comment ${i + 1} has empty content`);
        }
        if (comment.content && comment.content.length > 10000) {
          errors.push(`Comment ${i + 1} exceeds maximum length (10000 characters)`);
        }
      }
    }
    
    // Check thread context (if provided)
    if (thread.threadContext) {
      const context = thread.threadContext;
      
      if (!context.filePath || context.filePath.trim().length === 0) {
        errors.push('Thread context must have a file path');
      }
      
      if (!context.rightFileStart || context.rightFileStart.line < 1) {
        errors.push('Thread context must have valid start line');
      }
      
      if (!context.rightFileEnd || context.rightFileEnd.line < context.rightFileStart.line) {
        errors.push('Thread context must have valid end line');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get posting statistics
   */
  public getStatistics(result: CommentResult): string {
    const parts = [
      `${result.threadsCreated} threads created`,
      `${result.commentsCreated} comments created`
    ];
    
    if (result.threadsUpdated > 0) {
      parts.push(`${result.threadsUpdated} threads updated`);
    }
    
    if (result.threadsSkipped > 0) {
      parts.push(`${result.threadsSkipped} threads skipped`);
    }
    
    if (result.errors.length > 0) {
      parts.push(`${result.errors.length} errors`);
    }
    
    return parts.join(', ');
  }

  /**
   * Get commenter summary
   */
  public getSummary(): string {
    return 'Comment poster for Azure DevOps pull requests';
  }
}