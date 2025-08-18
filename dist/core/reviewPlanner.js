"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewPlanner = void 0;
class ReviewPlanner {
    logger;
    errorHandler;
    heuristics;
    constructor(logger, errorHandler) {
        this.logger = logger;
        this.errorHandler = errorHandler;
        // Enhanced heuristics for better handling of large PRs
        this.heuristics = {
            smallReviewThreshold: 3,
            mediumReviewThreshold: 10,
            largeReviewThreshold: 25, // Reduced from 200 to handle large PRs better
            maxTokensForSingle: 20000, // Reduced from 80000 to prevent 429 errors
            avgTokensPerHunk: 120, // More conservative estimate
            criticalFilePatterns: [
                '**/*.config.*',
                '**/package.json',
                '**/package-lock.json',
                '**/yarn.lock',
                '**/tsconfig.json',
                '**/Dockerfile',
                '**/docker-compose*.yml',
                '**/*.yml',
                '**/*.yaml',
                '**/README.md',
                '**/index.ts',
                '**/index.js',
                '**/main.ts',
                '**/main.js',
                '**/app.ts',
                '**/app.js',
                '**/schema.sql',
                '**/migration*.sql'
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
                '**/.prettierrc*',
                '**/babel.config.*',
                '**/jest.config.*'
            ]
        };
    }
    /**
     * Create review plan based on diff hunks
     */
    createPlan(diffHunks, options = {}) {
        try {
            this.logger.info('Creating review plan');
            const { maxTokensPerBatch = 50000, maxFilesPerBatch = 20, maxHunksPerBatch = 100, prioritizeFileTypes = [], excludeFileTypes = [], batchStrategy = 'mixed', forceStrategy } = options;
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
            const plan = {
                strategy,
                batches,
                totalFiles,
                totalHunks,
                estimatedTokens,
                estimatedDuration: this.estimateDuration(batches)
            };
            this.logger.info(`Review plan created: ${strategy} strategy, ${batches.length} batches, ~${Math.round(plan.estimatedDuration)}s estimated`);
            return plan;
        }
        catch (error) {
            throw this.errorHandler.createFromError(error, 'Failed to create review plan');
        }
    }
    /**
     * Determine optimal strategy based on enhanced heuristics for large PRs
     */
    determineStrategy(hunks, estimatedTokens) {
        const totalHunks = hunks.length;
        const totalFiles = new Set(hunks.map(h => h.filePath)).size;
        const avgHunkSize = estimatedTokens / totalHunks;
        // Force single if very small
        if (totalHunks <= this.heuristics.smallReviewThreshold) {
            this.logger.debug(`Using single strategy: small review (${totalHunks} hunks)`);
            return 'single';
        }
        // Force batch if very large (more aggressive batching)
        if (totalHunks > this.heuristics.largeReviewThreshold) {
            this.logger.debug(`Using batch strategy: large review (${totalHunks} hunks)`);
            return 'batch';
        }
        // Check token limit (more conservative)
        if (estimatedTokens > this.heuristics.maxTokensForSingle) {
            this.logger.debug(`Using batch strategy: token limit exceeded (${estimatedTokens} tokens)`);
            return 'batch';
        }
        // Check file diversity (reduced threshold)
        if (totalFiles > 8) {
            this.logger.debug(`Using batch strategy: many files (${totalFiles} files)`);
            return 'batch';
        }
        // Check average hunk size - if hunks are large, prefer batching
        if (avgHunkSize > 200) {
            this.logger.debug(`Using batch strategy: large average hunk size (${Math.round(avgHunkSize)} tokens)`);
            return 'batch';
        }
        // Check for critical files that should be reviewed separately
        const criticalFiles = hunks.filter(hunk => this.matchesPatterns(hunk.filePath, this.heuristics.criticalFilePatterns));
        if (criticalFiles.length > 0 && totalHunks > this.heuristics.mediumReviewThreshold) {
            this.logger.debug(`Using batch strategy: ${criticalFiles.length} critical files detected`);
            return 'batch';
        }
        // Check for mixed file types - if too diverse, use batching
        const fileExtensions = new Set(hunks.map(h => {
            const ext = h.filePath.split('.').pop()?.toLowerCase();
            return ext || 'no-ext';
        }));
        if (fileExtensions.size > 4) {
            this.logger.debug(`Using batch strategy: diverse file types (${fileExtensions.size} extensions)`);
            return 'batch';
        }
        this.logger.debug(`Using single strategy: medium-sized review`);
        return 'single';
    }
    /**
     * Create single batch containing all hunks
     */
    createSingleBatch(hunks) {
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
    createMultipleBatches(hunks, options) {
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
    createFileBasedBatches(hunks, options) {
        const batches = [];
        // Group hunks by category
        const categories = this.categorizeHunks(hunks);
        let batchId = 1;
        for (const [category, categoryHunks] of categories) {
            // Split large categories into sub-batches
            const subBatches = this.splitHunksIntoBatches(categoryHunks, options, `${category}-${batchId}`);
            batches.push(...subBatches);
            batchId += subBatches.length;
        }
        return this.optimizeBatches(batches);
    }
    /**
     * Create size-based batches (optimize for token/size limits)
     */
    createSizeBasedBatches(hunks, options) {
        // Sort hunks by estimated tokens (largest first)
        const sortedHunks = [...hunks].sort((a, b) => this.estimateHunkTokens(b) - this.estimateHunkTokens(a));
        return this.splitHunksIntoBatches(sortedHunks, options, 'size-based');
    }
    /**
     * Create mixed batches (smart combination of file-based and size-based)
     * Enhanced for large PR handling with intelligent grouping
     */
    createMixedBatches(hunks, options) {
        const batches = [];
        let batchId = 1;
        // Step 1: Separate critical files for priority processing
        const { critical, regular } = this.separateCriticalHunks(hunks);
        // Step 2: Process critical files first with smaller, focused batches
        if (critical.length > 0) {
            const criticalBatches = this.createCriticalFileBatches(critical, options, batchId);
            batches.push(...criticalBatches);
            batchId += criticalBatches.length;
        }
        // Step 3: Group regular files by type and complexity
        const groupedRegular = this.groupHunksByComplexity(regular);
        // Step 4: Process each complexity group
        for (const [complexity, complexityHunks] of groupedRegular) {
            const complexityBatches = this.createComplexityBasedBatches(complexityHunks, complexity, options, batchId);
            batches.push(...complexityBatches);
            batchId += complexityBatches.length;
        }
        return this.optimizeBatches(batches);
    }
    /**
     * Create focused batches for critical files
     */
    createCriticalFileBatches(criticalHunks, options, startBatchId) {
        // Use smaller batch sizes for critical files to ensure focused review
        const criticalOptions = {
            ...options,
            maxTokensPerBatch: Math.min(options.maxTokensPerBatch * 0.6, 12000),
            maxFilesPerBatch: Math.min(options.maxFilesPerBatch, 3),
            maxHunksPerBatch: Math.min(options.maxHunksPerBatch, 8)
        };
        return this.splitHunksIntoBatches(criticalHunks, criticalOptions, `critical-${startBatchId}`);
    }
    /**
     * Group hunks by complexity for better batch organization
     */
    groupHunksByComplexity(hunks) {
        const groups = new Map();
        for (const hunk of hunks) {
            const complexity = this.determineHunkComplexity(hunk);
            if (!groups.has(complexity)) {
                groups.set(complexity, []);
            }
            groups.get(complexity).push(hunk);
        }
        // Sort by complexity priority: high -> medium -> low
        const sortedGroups = new Map();
        ['high', 'medium', 'low'].forEach(complexity => {
            if (groups.has(complexity)) {
                sortedGroups.set(complexity, groups.get(complexity));
            }
        });
        return sortedGroups;
    }
    /**
     * Determine hunk complexity based on size and file type
     */
    determineHunkComplexity(hunk) {
        const tokens = this.estimateHunkTokens(hunk);
        const fileExt = hunk.filePath.split('.').pop()?.toLowerCase() || '';
        // High complexity: large changes or complex file types
        if (tokens > 300 || ['ts', 'js', 'tsx', 'jsx', 'py', 'java', 'cpp', 'c'].includes(fileExt)) {
            return 'high';
        }
        // Medium complexity: moderate changes or config files
        if (tokens > 150 || ['json', 'yml', 'yaml', 'xml', 'sql'].includes(fileExt)) {
            return 'medium';
        }
        // Low complexity: small changes or simple files
        return 'low';
    }
    /**
     * Create batches based on complexity level
     */
    createComplexityBasedBatches(hunks, complexity, options, startBatchId) {
        let batchOptions = { ...options };
        // Adjust batch sizes based on complexity
        switch (complexity) {
            case 'high':
                batchOptions = {
                    ...options,
                    maxTokensPerBatch: Math.min(options.maxTokensPerBatch * 0.7, 14000),
                    maxFilesPerBatch: Math.min(options.maxFilesPerBatch, 4),
                    maxHunksPerBatch: Math.min(options.maxHunksPerBatch, 6)
                };
                break;
            case 'medium':
                batchOptions = {
                    ...options,
                    maxTokensPerBatch: Math.min(options.maxTokensPerBatch * 0.85, 17000),
                    maxFilesPerBatch: Math.min(options.maxFilesPerBatch, 6),
                    maxHunksPerBatch: Math.min(options.maxHunksPerBatch, 10)
                };
                break;
            case 'low':
                // Use standard options for low complexity
                break;
        }
        return this.splitHunksIntoBatches(hunks, batchOptions, `${complexity}-${startBatchId}`);
    }
    /**
     * Split hunks into batches respecting size limits
     */
    splitHunksIntoBatches(hunks, options, batchPrefix) {
        const batches = [];
        let currentBatch = [];
        let currentTokens = 0;
        let currentFiles = new Set();
        let batchNumber = 1;
        for (const hunk of hunks) {
            const hunkTokens = this.estimateHunkTokens(hunk);
            const wouldExceedLimits = currentTokens + hunkTokens > options.maxTokensPerBatch ||
                currentFiles.size >= options.maxFilesPerBatch ||
                currentBatch.length >= options.maxHunksPerBatch;
            if (wouldExceedLimits && currentBatch.length > 0) {
                // Create batch
                batches.push(this.createBatchFromHunks(currentBatch, `${batchPrefix}-${batchNumber}`, currentTokens));
                // Reset for next batch
                currentBatch = [hunk];
                currentTokens = hunkTokens;
                currentFiles = new Set([hunk.filePath]);
                batchNumber++;
            }
            else {
                currentBatch.push(hunk);
                currentTokens += hunkTokens;
                currentFiles.add(hunk.filePath);
            }
        }
        // Add final batch
        if (currentBatch.length > 0) {
            batches.push(this.createBatchFromHunks(currentBatch, `${batchPrefix}-${batchNumber}`, currentTokens));
        }
        return batches;
    }
    /**
     * Create batch from hunks
     */
    createBatchFromHunks(hunks, id, estimatedTokens) {
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
    categorizeHunks(hunks) {
        const categories = new Map();
        for (const hunk of hunks) {
            const category = this.getFileCategory(hunk.filePath);
            if (!categories.has(category)) {
                categories.set(category, []);
            }
            categories.get(category).push(hunk);
        }
        return categories;
    }
    /**
     * Get file category based on path patterns
     */
    getFileCategory(filePath) {
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
    separateCriticalHunks(hunks) {
        const critical = [];
        const regular = [];
        for (const hunk of hunks) {
            if (this.matchesPatterns(hunk.filePath, this.heuristics.criticalFilePatterns)) {
                critical.push(hunk);
            }
            else {
                regular.push(hunk);
            }
        }
        return { critical, regular };
    }
    /**
     * Determine batch priority
     */
    determineBatchPriority(hunks) {
        const hasCriticalFiles = hunks.some(hunk => this.matchesPatterns(hunk.filePath, this.heuristics.criticalFilePatterns));
        if (hasCriticalFiles) {
            return 'high';
        }
        const hasTestFiles = hunks.some(hunk => this.matchesPatterns(hunk.filePath, this.heuristics.testFilePatterns));
        if (hasTestFiles) {
            return 'low';
        }
        return 'medium';
    }
    /**
     * Generate batch description
     */
    generateBatchDescription(hunks, files) {
        const categories = new Set(hunks.map(h => this.getFileCategory(h.filePath)));
        const categoryList = Array.from(categories).join(', ');
        return `${files.length} files (${categoryList}), ${hunks.length} hunks`;
    }
    /**
     * Optimize batches (merge small ones, split large ones)
     */
    optimizeBatches(batches) {
        // TODO: Implement batch optimization logic
        // For now, return as-is
        return batches;
    }
    /**
     * Filter hunks based on criteria
     */
    filterHunks(hunks, criteria) {
        let filtered = hunks;
        if (criteria.excludeFileTypes && criteria.excludeFileTypes.length > 0) {
            filtered = filtered.filter(hunk => {
                const ext = hunk.filePath.split('.').pop()?.toLowerCase();
                return !criteria.excludeFileTypes.includes(ext || '');
            });
        }
        return filtered;
    }
    /**
     * Check if file path matches any of the patterns
     */
    matchesPatterns(filePath, patterns) {
        // Simple pattern matching (could be enhanced with proper glob matching)
        return patterns.some(pattern => {
            const regex = new RegExp(pattern
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^/]*')
                .replace(/\?/g, '.'));
            return regex.test(filePath);
        });
    }
    /**
     * Estimate total tokens for all hunks
     */
    estimateTotalTokens(hunks) {
        return hunks.reduce((total, hunk) => total + this.estimateHunkTokens(hunk), 0);
    }
    /**
     * Estimate tokens for a single hunk
     */
    estimateHunkTokens(hunk) {
        // Rough estimation: file path + content + metadata
        const pathTokens = Math.ceil(hunk.filePath.length / 4);
        const contentTokens = Math.ceil(hunk.content.length / 4);
        const metadataTokens = 20; // Fixed overhead
        return pathTokens + contentTokens + metadataTokens;
    }
    /**
     * Estimate duration for batches
     */
    estimateDuration(batches) {
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
    createEmptyPlan() {
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
    getSummary(plan) {
        if (plan.batches.length === 0) {
            return 'No changes to review';
        }
        const duration = Math.round(plan.estimatedDuration);
        return `${plan.strategy} strategy: ${plan.batches.length} batches, ${plan.totalFiles} files, ${plan.totalHunks} hunks, ~${duration}s`;
    }
    /**
     * Update heuristics
     */
    updateHeuristics(updates) {
        this.heuristics = { ...this.heuristics, ...updates };
        this.logger.debug('Planning heuristics updated');
    }
}
exports.ReviewPlanner = ReviewPlanner;
//# sourceMappingURL=reviewPlanner.js.map