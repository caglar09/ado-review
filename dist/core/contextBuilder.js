"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextBuilder = void 0;
class ContextBuilder {
    logger;
    errorHandler;
    constructor(logger, errorHandler) {
        this.logger = logger;
        this.errorHandler = errorHandler;
    }
    /**
     * Build review context from loaded rules and diffs
     */
    buildContext(loadedRules, diffHunks, options = {}) {
        try {
            this.logger.info('Building review context');
            const { maxTokens = 100000, compactFormat = false, prioritizeRules = [] } = options;
            // Merge rule sets
            const mergedRuleSet = this.mergeRuleSets(loadedRules.ruleSets, prioritizeRules);
            // Build sections
            const projectGuidelines = this.buildGuidelinesSection(loadedRules.guidelines, compactFormat);
            const reviewRules = this.buildRulesSection(mergedRuleSet, compactFormat);
            const diffs = this.buildDiffsSection(diffHunks, compactFormat);
            // Calculate metadata
            const metadata = {
                totalFiles: new Set(diffHunks.map(h => h.filePath)).size,
                totalHunks: diffHunks.length,
                totalLines: diffHunks.reduce((sum, hunk) => sum + hunk.newLineCount, 0),
                ruleCount: mergedRuleSet.rules.filter(r => r.enabled).length,
                guidelineCount: loadedRules.guidelines.length
            };
            const context = {
                projectGuidelines,
                reviewRules,
                diffs,
                ...(options.customPromptTemplate && { customPromptTemplate: options.customPromptTemplate }),
                metadata
            };
            // Check token limits
            const estimatedTokens = this.estimateTokenCount(context);
            if (estimatedTokens > maxTokens) {
                this.logger.warn(`Context size (${estimatedTokens} tokens) exceeds limit (${maxTokens}). Consider splitting into batches.`);
            }
            this.logger.info(`Context built: ${metadata.totalFiles} files, ${metadata.totalHunks} hunks, ${metadata.ruleCount} rules, ${metadata.guidelineCount} guidelines`);
            return context;
        }
        catch (error) {
            throw this.errorHandler.createFromError(error, 'Failed to build context', {
                operation: 'buildContext',
                component: 'ContextBuilder',
                metadata: { diffCount: diffHunks.length, options }
            });
        }
    }
    /**
     * Build a ReviewContext from an existing base (guidelines + rules) and a set of hunks
     * Useful for batched reviews to avoid rebuilding rules/guidelines every time.
     */
    buildContextForHunks(base, hunks, options = {}) {
        const { compactFormat = true } = options;
        const diffs = this.buildDiffsSection(hunks, compactFormat);
        const metadata = {
            totalFiles: new Set(hunks.map(h => h.filePath)).size,
            totalHunks: hunks.length,
            totalLines: hunks.reduce((sum, hunk) => sum + hunk.newLineCount, 0),
            // Rule/guideline counts are not known from base; set to 0 to avoid confusion in batch logs
            ruleCount: 0,
            guidelineCount: 0
        };
        const context = {
            projectGuidelines: base.projectGuidelines,
            reviewRules: base.reviewRules,
            diffs,
            ...(base.customPromptTemplate && { customPromptTemplate: base.customPromptTemplate }),
            metadata
        };
        return context;
    }
    /**
     * Convert context to LLM prompt
     */
    toPrompt(context, options = {}) {
        const { includeMetadata = true } = options;
        // Use custom prompt template if provided
        if (context.customPromptTemplate) {
            return this.applyCustomTemplate(context, context.customPromptTemplate, includeMetadata);
        }
        const sections = [];
        // Add metadata if requested
        if (includeMetadata) {
            sections.push(this.buildMetadataSection(context.metadata));
        }
        // Add main sections
        if (context.projectGuidelines.trim()) {
            sections.push('[PROJECT STRUCTURE & GUIDELINES]');
            sections.push(context.projectGuidelines);
            sections.push('');
        }
        if (context.reviewRules.trim()) {
            sections.push('[REVIEW RULES]');
            sections.push(context.reviewRules);
            sections.push('');
        }
        if (context.diffs.trim()) {
            sections.push('[DIFFS TO REVIEW]');
            sections.push(context.diffs);
        }
        // Add instructions
        sections.push('');
        sections.push('[INSTRUCTIONS]');
        sections.push(this.getReviewInstructions());
        return sections.join('\n');
    }
    /**
     * Split context into batches for large reviews
     */
    splitIntoBatches(loadedRules, diffHunks, maxTokensPerBatch = 50000) {
        this.logger.info(`Splitting context into batches (max ${maxTokensPerBatch} tokens per batch)`);
        const batches = [];
        const baseContext = {
            projectGuidelines: this.buildGuidelinesSection(loadedRules.guidelines, true),
            reviewRules: this.buildRulesSection(this.mergeRuleSets(loadedRules.ruleSets), true)
        };
        // Estimate base context size
        const baseTokens = this.estimateTokenCount({
            ...baseContext,
            diffs: '',
            metadata: { totalFiles: 0, totalHunks: 0, totalLines: 0, ruleCount: 0, guidelineCount: 0 }
        });
        const availableTokens = maxTokensPerBatch - baseTokens - 1000; // Reserve for instructions
        let currentBatch = [];
        let currentTokens = 0;
        for (const hunk of diffHunks) {
            const hunkTokens = this.estimateHunkTokens(hunk);
            if (currentTokens + hunkTokens > availableTokens && currentBatch.length > 0) {
                // Create batch
                batches.push(this.createBatch(baseContext, currentBatch, loadedRules));
                currentBatch = [hunk];
                currentTokens = hunkTokens;
            }
            else {
                currentBatch.push(hunk);
                currentTokens += hunkTokens;
            }
        }
        // Add final batch
        if (currentBatch.length > 0) {
            batches.push(this.createBatch(baseContext, currentBatch, loadedRules));
        }
        this.logger.info(`Created ${batches.length} batches`);
        return batches;
    }
    /**
     * Create a single batch
     */
    createBatch(baseContext, hunks, loadedRules) {
        const diffs = this.buildDiffsSection(hunks, true);
        const metadata = {
            totalFiles: new Set(hunks.map(h => h.filePath)).size,
            totalHunks: hunks.length,
            totalLines: hunks.reduce((sum, hunk) => sum + hunk.newLineCount, 0),
            ruleCount: loadedRules.enabledRules,
            guidelineCount: loadedRules.guidelines.length
        };
        return {
            ...baseContext,
            diffs,
            metadata
        };
    }
    /**
     * Build guidelines section
     */
    buildGuidelinesSection(guidelines, compact = false) {
        if (guidelines.length === 0) {
            return '';
        }
        const sections = [];
        for (const guideline of guidelines) {
            if (compact) {
                sections.push(`## ${guideline.title}`);
                sections.push(this.truncateContent(guideline.content, 500));
            }
            else {
                sections.push(`## ${guideline.title}`);
                sections.push(`Source: ${guideline.source}`);
                sections.push('');
                sections.push(guideline.content);
            }
            sections.push('');
        }
        return sections.join('\n');
    }
    /**
     * Build rules section
     */
    buildRulesSection(ruleSet, compact = false) {
        const enabledRules = ruleSet.rules.filter(rule => rule.enabled);
        if (enabledRules.length === 0) {
            return '';
        }
        if (compact) {
            return JSON.stringify({
                name: ruleSet.name,
                rules: enabledRules.map(rule => ({
                    id: rule.id,
                    name: rule.name,
                    severity: rule.severity,
                    category: rule.category,
                    description: this.truncateContent(rule.description, 100)
                }))
            }, null, 2);
        }
        return JSON.stringify({
            name: ruleSet.name,
            version: ruleSet.version,
            description: ruleSet.description,
            rules: enabledRules
        }, null, 2);
    }
    /**
     * Build diffs section
     */
    buildDiffsSection(diffHunks, compact = false) {
        if (diffHunks.length === 0) {
            return '';
        }
        const sections = [];
        // Group by file
        const fileGroups = new Map();
        for (const hunk of diffHunks) {
            if (!fileGroups.has(hunk.filePath)) {
                fileGroups.set(hunk.filePath, []);
            }
            fileGroups.get(hunk.filePath).push(hunk);
        }
        for (const [filePath, hunks] of fileGroups) {
            sections.push(`### File: ${filePath}`);
            if (compact) {
                sections.push(`Changes: ${hunks.length} hunks, ${hunks.reduce((sum, h) => sum + h.newLineCount, 0)} lines`);
            }
            for (const hunk of hunks) {
                sections.push('');
                sections.push(`#### Hunk: Lines ${hunk.newStartLine}-${hunk.newStartLine + hunk.newLineCount - 1} (${hunk.changeType})`);
                sections.push('```diff');
                sections.push(hunk.content);
                sections.push('```');
            }
            sections.push('');
        }
        return sections.join('\n');
    }
    /**
     * Build metadata section
     */
    buildMetadataSection(metadata) {
        return `[REVIEW METADATA]
Files: ${metadata.totalFiles}, Hunks: ${metadata.totalHunks}, Lines: ${metadata.totalLines}, Rules: ${metadata.ruleCount}, Guidelines: ${metadata.guidelineCount}\n`;
    }
    /**
     * Get review instructions
     */
    getReviewInstructions() {
        return `Please review the provided code changes according to the project guidelines and rules.
For each issue found, provide:
1. File path and line number(s)
2. Issue description
3. Severity level (error/warning/info)
4. Suggested fix or improvement
5. Rule ID (if applicable)

Focus only on the changed lines and their immediate context.
Provide constructive feedback that helps improve code quality.
Return results in JSON format with the following structure:
{
  "findings": [
    {
      "file": "path/to/file",
      "line": 123,
      "endLine": 125,
      "severity": "warning",
      "message": "Issue description",
      "suggestion": "Suggested fix",
      "ruleId": "rule-id",
      "category": "category-name"
    }
  ]
}`;
    }
    /**
     * Apply custom prompt template with context data
     */
    applyCustomTemplate(context, template, includeMetadata) {
        let result = template;
        // Replace placeholders with actual context data
        result = result.replace(/\{\{PROJECT_GUIDELINES\}\}/g, context.projectGuidelines || '');
        result = result.replace(/\{\{REVIEW_RULES\}\}/g, context.reviewRules || '');
        result = result.replace(/\{\{DIFFS\}\}/g, context.diffs || '');
        result = result.replace(/\{\{INSTRUCTIONS\}\}/g, this.getReviewInstructions());
        if (includeMetadata) {
            result = result.replace(/\{\{METADATA\}\}/g, this.buildMetadataSection(context.metadata));
        }
        else {
            result = result.replace(/\{\{METADATA\}\}/g, '');
        }
        // Clean up any remaining empty placeholders
        result = result.replace(/\{\{[^}]+\}\}/g, '');
        return result;
    }
    /**
     * Merge rule sets with prioritization
     */
    mergeRuleSets(ruleSets, prioritizeRules = []) {
        if (ruleSets.length === 0) {
            return {
                name: 'empty',
                version: '1.0.0',
                rules: []
            };
        }
        const allRules = ruleSets.flatMap(rs => rs.rules);
        const uniqueRules = new Map();
        // Add rules, with priority rules first
        for (const ruleId of prioritizeRules) {
            const rule = allRules.find(r => r.id === ruleId);
            if (rule) {
                uniqueRules.set(rule.id, rule);
            }
        }
        // Add remaining rules
        for (const rule of allRules) {
            if (!uniqueRules.has(rule.id)) {
                uniqueRules.set(rule.id, rule);
            }
        }
        return {
            name: 'merged',
            version: '1.0.0',
            description: `Merged from ${ruleSets.length} rule sets`,
            rules: Array.from(uniqueRules.values())
        };
    }
    /**
     * Estimate token count for context
     */
    estimateTokenCount(context) {
        const text = this.toPrompt(context, { includeMetadata: false });
        // Rough estimation: 1 token ≈ 4 characters
        return Math.ceil(text.length / 4);
    }
    /**
     * Estimate token count for a single hunk
     */
    estimateHunkTokens(hunk) {
        const text = `### File: ${hunk.filePath}\n#### Hunk: Lines ${hunk.newStartLine}-${hunk.newStartLine + hunk.newLineCount - 1}\n\`\`\`diff\n${hunk.content}\n\`\`\``;
        return Math.ceil(text.length / 4);
    }
    /**
     * Truncate content to specified length
     */
    truncateContent(content, maxLength) {
        if (content.length <= maxLength) {
            return content;
        }
        return content.substring(0, maxLength - 3) + '...';
    }
    /**
     * Get context summary
     */
    getSummary(context) {
        const { metadata } = context;
        return `${metadata.totalFiles} files, ${metadata.totalHunks} hunks, ${metadata.ruleCount} rules, ${metadata.guidelineCount} guidelines`;
    }
    /**
     * Validate context
     */
    validateContext(context) {
        const issues = [];
        if (!context.diffs.trim()) {
            issues.push('No diffs provided for review');
        }
        if (!context.reviewRules.trim() && !context.projectGuidelines.trim()) {
            issues.push('No rules or guidelines provided');
        }
        if (context.metadata.totalFiles === 0) {
            issues.push('No files to review');
        }
        const estimatedTokens = this.estimateTokenCount(context);
        if (estimatedTokens > 200000) {
            issues.push(`Context too large (${estimatedTokens} tokens). Consider splitting into batches.`);
        }
        return {
            valid: issues.length === 0,
            issues
        };
    }
}
exports.ContextBuilder = ContextBuilder;
//# sourceMappingURL=contextBuilder.js.map