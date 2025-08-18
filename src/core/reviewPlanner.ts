import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';
import { DiffHunk } from './contextBuilder';

export interface ReviewPlan {
  strategy: 'single' | 'batch';
  batches: ReviewBatch[];
  totalFiles: number;
  totalHunks: number;
  estimatedTokens: number;
  estimatedDuration: number; // in seconds
}

export interface ReviewBatch {
  id: string;
  hunks: DiffHunk[];
  files: string[];
  estimatedTokens: number;
  priority: 'high' | 'medium' | 'low';
  description: string;
}

export interface PlanningOptions {
  maxTokensPerBatch?: number;
  maxFilesPerBatch?: number;
  maxHunksPerBatch?: number;
  prioritizeFileTypes?: string[];
  excludeFileTypes?: string[];
  batchStrategy?: 'file-based' | 'size-based' | 'mixed';
  forceStrategy?: 'single' | 'batch';
}

export interface PlanningHeuristics {
  smallReviewThreshold: number; // Total hunks
  mediumReviewThreshold: number;
  largeReviewThreshold: number;
  maxTokensForSingle: number;
  avgTokensPerHunk: number;
  criticalFilePatterns: string[];
  testFilePatterns: string[];
  configFilePatterns: string[];
}

export class ReviewPlanner {
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private heuristics: PlanningHeuristics;

  constructor(logger: Logger, errorHandler: ErrorHandler) {
    this.logger = logger;
    this.errorHandler = errorHandler;

    // Default heuristics
    this.heuristics = {
      smallReviewThreshold: 10,
      mediumReviewThreshold: 50,
      largeReviewThreshold: 200,
      maxTokensForSingle: 80000,
      avgTokensPerHunk: 150,
      criticalFilePatterns: [
        '**/*.config.*',
        '**/package.json',
        '**/tsconfig.json',
        '**/Dockerfile',
        '**/*.yml',
        '**/*.yaml',
        '**/README.md'
      ],
      testFilePatterns: [
        '**/*.test.*',
        '**/*.spec.*',
        '**/test/**',
        '**/tests/**',
        '**/__tests__/**'
      ],
      configFilePatterns: [
        '**/.env*',
        '**/webpack.config.*',
        '**/vite.config.*',
        '**/rollup.config.*',
        '**/.eslintrc*',
        '**/.prettierrc*'
      ]
    };
  }

  /**
   * Create review plan based on diff hunks
   */
  public createPlan(
    diffHunks: DiffHunk[],
    options: PlanningOptions = {}
  ): ReviewPlan {
    try {
      this.logger.info('Creating review plan');

      const {
        maxTokensPerBatch = 50000,
        maxFilesPerBatch = 20,
        maxHunksPerBatch = 100,
        prioritizeFileTypes = [],
        excludeFileTypes = [],
        batchStrategy = 'mixed',
        forceStrategy
      } = options;

      // Filter hunks if needed
      const filteredHunks = this.filterHunks(diffHunks, { excludeFileTypes });

      if (filteredHunks.length === 0) {
        return this.createEmptyPlan();
      }

      // Calculate basic metrics
      const totalFiles = new Set(filteredHunks.map(h => h.filePath)).size;
      const totalHunks = filteredHunks.length;
      const estimatedTokens = this.estimateTotalTokens(filteredHunks);

      // Determine strategy
      const strategy = forceStrategy || this.determineStrategy(filteredHunks, estimatedTokens);

      // Create batches
      const batches = strategy === 'single'
        ? [this.createSingleBatch(filteredHunks)]
        : this.createMultipleBatches(filteredHunks, {
          maxTokensPerBatch,
          maxFilesPerBatch,
          maxHunksPerBatch,
          batchStrategy,
          prioritizeFileTypes
        });

      const plan: ReviewPlan = {
        strategy,
        batches,
        totalFiles,
        totalHunks,
        estimatedTokens,
        estimatedDuration: this.estimateDuration(batches)
      };

      this.logger.info(`Review plan created: ${strategy} strategy, ${batches.length} batches, ~${Math.round(plan.estimatedDuration)}s estimated`);

      return plan;
    } catch (error) {
      throw this.errorHandler.createFromError(
        error as Error,
        'Failed to create review plan'
      );
    }
  }

  /**
   * Determine optimal strategy based on heuristics
   */
  private determineStrategy(hunks: DiffHunk[], estimatedTokens: number): 'single' | 'batch' {
    const totalHunks = hunks.length;
    const totalFiles = new Set(hunks.map(h => h.filePath)).size;

    // Force single if very small
    if (totalHunks <= this.heuristics.smallReviewThreshold) {
      this.logger.debug(`Using single strategy: small review (${totalHunks} hunks)`);
      return 'single';
    }

    // Force batch if very large
    if (totalHunks > this.heuristics.largeReviewThreshold) {
      this.logger.debug(`Using batch strategy: large review (${totalHunks} hunks)`);
      return 'batch';
    }

    // Check token limit
    if (estimatedTokens > this.heuristics.maxTokensForSingle) {
      this.logger.debug(`Using batch strategy: token limit exceeded (${estimatedTokens} tokens)`);
      return 'batch';
    }

    // Check file diversity
    if (totalFiles > 15) {
      this.logger.debug(`Using batch strategy: many files (${totalFiles} files)`);
      return 'batch';
    }

    // Check for critical files that should be reviewed separately
    const hasCriticalFiles = hunks.some(hunk =>
      this.matchesPatterns(hunk.filePath, this.heuristics.criticalFilePatterns)
    );

    if (hasCriticalFiles && totalHunks > this.heuristics.mediumReviewThreshold) {
      this.logger.debug(`Using batch strategy: critical files detected`);
      return 'batch';
    }

    this.logger.debug(`Using single strategy: medium-sized review`);
    return 'single';
  }

  /**
   * Create single batch containing all hunks
   */
  private createSingleBatch(hunks: DiffHunk[]): ReviewBatch {
    const files = Array.from(new Set(hunks.map(h => h.filePath)));

    return {
      id: 'single',
      hunks,
      files,
      estimatedTokens: this.estimateTotalTokens(hunks),
      priority: this.determineBatchPriority(hunks),
      description: `Complete review: ${files.length} files, ${hunks.length} hunks`
    };
  }

  /**
   * Create multiple batches
   */
  private createMultipleBatches(
    hunks: DiffHunk[],
    options: {
      maxTokensPerBatch: number;
      maxFilesPerBatch: number;
      maxHunksPerBatch: number;
      batchStrategy: 'file-based' | 'size-based' | 'mixed';
      prioritizeFileTypes: string[];
    }
  ): ReviewBatch[] {
    const { batchStrategy } = options;

    switch (batchStrategy) {
      case 'file-based':
        return this.createFileBasedBatches(hunks, options);
      case 'size-based':
        return this.createSizeBasedBatches(hunks, options);
      case 'mixed':
      default:
        return this.createMixedBatches(hunks, options);
    }
  }

  /**
   * Create file-based batches (group by file type/category)
   */
  private createFileBasedBatches(
    hunks: DiffHunk[],
    options: {
      maxTokensPerBatch: number;
      maxFilesPerBatch: number;
      maxHunksPerBatch: number;
      prioritizeFileTypes: string[];
    }
  ): ReviewBatch[] {
    const batches: ReviewBatch[] = [];

    // Group hunks by category
    const categories = this.categorizeHunks(hunks);

    let batchId = 1;

    for (const [category, categoryHunks] of categories) {
      // Split large categories into sub-batches
      const subBatches = this.splitHunksIntoBatches(
        categoryHunks,
        options,
        `${category}-${batchId}`
      );

      batches.push(...subBatches);
      batchId += subBatches.length;
    }

    return this.optimizeBatches(batches);
  }

  /**
   * Create size-based batches (optimize for token/size limits)
   */
  private createSizeBasedBatches(
    hunks: DiffHunk[],
    options: {
      maxTokensPerBatch: number;
      maxFilesPerBatch: number;
      maxHunksPerBatch: number;
    }
  ): ReviewBatch[] {
    // Sort hunks by estimated tokens (largest first)
    const sortedHunks = [...hunks].sort((a, b) =>
      this.estimateHunkTokens(b) - this.estimateHunkTokens(a)
    );

    return this.splitHunksIntoBatches(sortedHunks, options, 'size-based');
  }

  /**
   * Create mixed batches (balance file grouping and size limits)
   */
  private createMixedBatches(
    hunks: DiffHunk[],
    options: {
      maxTokensPerBatch: number;
      maxFilesPerBatch: number;
      maxHunksPerBatch: number;
      prioritizeFileTypes: string[];
    }
  ): ReviewBatch[] {
    const batches: ReviewBatch[] = [];

    // First, handle critical files separately
    const { critical, regular } = this.separateCriticalHunks(hunks);

    if (critical.length > 0) {
      const criticalBatches = this.splitHunksIntoBatches(
        critical,
        { ...options, maxHunksPerBatch: Math.min(options.maxHunksPerBatch, 20) },
        'critical'
      );
      batches.push(...criticalBatches);
    }

    // Then handle regular files by category
    const categories = this.categorizeHunks(regular);
    let batchId = batches.length + 1;

    for (const [category, categoryHunks] of categories) {
      const subBatches = this.splitHunksIntoBatches(
        categoryHunks,
        options,
        `${category}-${batchId}`
      );

      batches.push(...subBatches);
      batchId += subBatches.length;
    }

    return this.optimizeBatches(batches);
  }

  /**
   * Split hunks into batches respecting size limits
   */
  private splitHunksIntoBatches(
    hunks: DiffHunk[],
    options: {
      maxTokensPerBatch: number;
      maxFilesPerBatch: number;
      maxHunksPerBatch: number;
    },
    batchPrefix: string
  ): ReviewBatch[] {
    const batches: ReviewBatch[] = [];

    let currentBatch: DiffHunk[] = [];
    let currentTokens = 0;
    let currentFiles = new Set<string>();
    let batchNumber = 1;

    for (const hunk of hunks) {
      const hunkTokens = this.estimateHunkTokens(hunk);
      const wouldExceedLimits =
        currentTokens + hunkTokens > options.maxTokensPerBatch ||
        currentFiles.size >= options.maxFilesPerBatch ||
        currentBatch.length >= options.maxHunksPerBatch;

      if (wouldExceedLimits && currentBatch.length > 0) {
        // Create batch
        batches.push(this.createBatchFromHunks(
          currentBatch,
          `${batchPrefix}-${batchNumber}`,
          currentTokens
        ));

        // Reset for next batch
        currentBatch = [hunk];
        currentTokens = hunkTokens;
        currentFiles = new Set([hunk.filePath]);
        batchNumber++;
      } else {
        currentBatch.push(hunk);
        currentTokens += hunkTokens;
        currentFiles.add(hunk.filePath);
      }
    }

    // Add final batch
    if (currentBatch.length > 0) {
      batches.push(this.createBatchFromHunks(
        currentBatch,
        `${batchPrefix}-${batchNumber}`,
        currentTokens
      ));
    }

    return batches;
  }

  /**
   * Create batch from hunks
   */
  private createBatchFromHunks(
    hunks: DiffHunk[],
    id: string,
    estimatedTokens: number
  ): ReviewBatch {
    const files = Array.from(new Set(hunks.map(h => h.filePath)));

    return {
      id,
      hunks,
      files,
      estimatedTokens,
      priority: this.determineBatchPriority(hunks),
      description: this.generateBatchDescription(hunks, files)
    };
  }

  /**
   * Categorize hunks by file type/purpose
   */
  private categorizeHunks(hunks: DiffHunk[]): Map<string, DiffHunk[]> {
    const categories = new Map<string, DiffHunk[]>();

    for (const hunk of hunks) {
      const category = this.getFileCategory(hunk.filePath);

      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(hunk);
    }

    return categories;
  }

  /**
   * Get file category based on path patterns
   */
  private getFileCategory(filePath: string): string {
    if (this.matchesPatterns(filePath, this.heuristics.testFilePatterns)) {
      return 'tests';
    }

    if (this.matchesPatterns(filePath, this.heuristics.configFilePatterns)) {
      return 'config';
    }

    if (this.matchesPatterns(filePath, this.heuristics.criticalFilePatterns)) {
      return 'critical';
    }

    const ext = filePath.split('.').pop()?.toLowerCase();

    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'py':
        return 'python';
      case 'java':
        return 'java';
      case 'css':
      case 'scss':
      case 'less':
        return 'styles';
      case 'md':
        return 'documentation';
      case 'json':
      case 'yaml':
      case 'yml':
        return 'data';
      default:
        return 'other';
    }
  }

  /**
   * Separate critical hunks from regular ones
   */
  private separateCriticalHunks(hunks: DiffHunk[]): { critical: DiffHunk[]; regular: DiffHunk[] } {
    const critical: DiffHunk[] = [];
    const regular: DiffHunk[] = [];

    for (const hunk of hunks) {
      if (this.matchesPatterns(hunk.filePath, this.heuristics.criticalFilePatterns)) {
        critical.push(hunk);
      } else {
        regular.push(hunk);
      }
    }

    return { critical, regular };
  }

  /**
   * Determine batch priority
   */
  private determineBatchPriority(hunks: DiffHunk[]): 'high' | 'medium' | 'low' {
    const hasCriticalFiles = hunks.some(hunk =>
      this.matchesPatterns(hunk.filePath, this.heuristics.criticalFilePatterns)
    );

    if (hasCriticalFiles) {
      return 'high';
    }

    const hasTestFiles = hunks.some(hunk =>
      this.matchesPatterns(hunk.filePath, this.heuristics.testFilePatterns)
    );

    if (hasTestFiles) {
      return 'low';
    }

    return 'medium';
  }

  /**
   * Generate batch description
   */
  private generateBatchDescription(hunks: DiffHunk[], files: string[]): string {
    const categories = new Set(hunks.map(h => this.getFileCategory(h.filePath)));
    const categoryList = Array.from(categories).join(', ');

    return `${files.length} files (${categoryList}), ${hunks.length} hunks`;
  }

  /**
   * Optimize batches (merge small ones, split large ones)
   */
  private optimizeBatches(
    batches: ReviewBatch[]
  ): ReviewBatch[] {
    // TODO: Implement batch optimization logic
    // For now, return as-is
    return batches;
  }

  /**
   * Filter hunks based on criteria
   */
  private filterHunks(
    hunks: DiffHunk[],
    criteria: {
      excludeFileTypes?: string[];
    }
  ): DiffHunk[] {
    let filtered = hunks;

    if (criteria.excludeFileTypes && criteria.excludeFileTypes.length > 0) {
      filtered = filtered.filter(hunk => {
        const ext = hunk.filePath.split('.').pop()?.toLowerCase();
        return !criteria.excludeFileTypes!.includes(ext || '');
      });
    }

    return filtered;
  }

  /**
   * Check if file path matches any of the patterns
   */
  private matchesPatterns(filePath: string, patterns: string[]): boolean {
    // Simple pattern matching (could be enhanced with proper glob matching)
    return patterns.some(pattern => {
      const regex = new RegExp(
        pattern
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*')
          .replace(/\?/g, '.')
      );
      return regex.test(filePath);
    });
  }

  /**
   * Estimate total tokens for all hunks
   */
  private estimateTotalTokens(hunks: DiffHunk[]): number {
    return hunks.reduce((total, hunk) => total + this.estimateHunkTokens(hunk), 0);
  }

  /**
   * Estimate tokens for a single hunk
   */
  private estimateHunkTokens(hunk: DiffHunk): number {
    // Rough estimation: file path + content + metadata
    const pathTokens = Math.ceil(hunk.filePath.length / 4);
    const contentTokens = Math.ceil(hunk.content.length / 4);
    const metadataTokens = 20; // Fixed overhead

    return pathTokens + contentTokens + metadataTokens;
  }

  /**
   * Estimate duration for batches
   */
  private estimateDuration(batches: ReviewBatch[]): number {
    // Rough estimation: 30 seconds per 1000 tokens + 10 seconds overhead per batch
    return batches.reduce((total, batch) => {
      const tokenTime = (batch.estimatedTokens / 1000) * 30;
      const overhead = 10;
      return total + tokenTime + overhead;
    }, 0);
  }

  /**
   * Create empty plan
   */
  private createEmptyPlan(): ReviewPlan {
    return {
      strategy: 'single',
      batches: [],
      totalFiles: 0,
      totalHunks: 0,
      estimatedTokens: 0,
      estimatedDuration: 0
    };
  }

  /**
   * Get plan summary
   */
  public getSummary(plan: ReviewPlan): string {
    if (plan.batches.length === 0) {
      return 'No changes to review';
    }

    const duration = Math.round(plan.estimatedDuration);
    return `${plan.strategy} strategy: ${plan.batches.length} batches, ${plan.totalFiles} files, ${plan.totalHunks} hunks, ~${duration}s`;
  }

  /**
   * Update heuristics
   */
  public updateHeuristics(updates: Partial<PlanningHeuristics>): void {
    this.heuristics = { ...this.heuristics, ...updates };
    this.logger.debug('Planning heuristics updated');
  }
}