"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResultMapper = void 0;
class ResultMapper {
    logger;
    errorHandler;
    defaultOptions;
    constructor(logger, errorHandler) {
        this.logger = logger;
        this.errorHandler = errorHandler;
        this.defaultOptions = {
            maxCommentsPerThread: 5,
            maxThreadsPerFile: 10,
            maxTotalThreads: 50,
            includeRuleId: true,
            includeCategory: true,
            includeSuggestions: true,
            groupBySeverity: false,
            createSummaryComment: true,
            summaryCommentThreshold: 20
        };
    }
    /**
     * Map review results to ADO comment threads
     */
    mapToCommentThreads(reviewResult, options = {}) {
        try {
            const opts = { ...this.defaultOptions, ...options };
            const { findings } = reviewResult;
            this.logger.info(`Mapping ${findings.length} findings to ADO comment threads`);
            // Group findings by file and line
            const groupedFindings = this.groupFindings(findings, opts);
            // Create comment threads
            const threads = [];
            let mappedCount = 0;
            let skippedCount = 0;
            for (const [fileKey, fileFindings] of groupedFindings.entries()) {
                const fileThreads = this.createThreadsForFile(fileKey, fileFindings, opts);
                // Apply file-level limits
                const limitedThreads = fileThreads.slice(0, opts.maxThreadsPerFile);
                threads.push(...limitedThreads);
                mappedCount += limitedThreads.reduce((sum, thread) => sum + thread.comments.length, 0);
                skippedCount += fileThreads.length - limitedThreads.length;
                // Apply global limit
                if (threads.length >= opts.maxTotalThreads) {
                    this.logger.warn(`Reached maximum thread limit (${opts.maxTotalThreads})`);
                    break;
                }
            }
            // Create summary comment if needed
            let summaryComment;
            if (opts.createSummaryComment && findings.length >= opts.summaryCommentThreshold) {
                summaryComment = this.createSummaryComment(reviewResult, mappedCount, skippedCount);
            }
            const result = {
                threads: threads.slice(0, opts.maxTotalThreads),
                ...(summaryComment && { summaryComment }),
                stats: {
                    totalFindings: findings.length,
                    mappedFindings: mappedCount,
                    skippedFindings: skippedCount + Math.max(0, findings.length - mappedCount),
                    threadsCreated: threads.length,
                    commentsCreated: threads.reduce((sum, thread) => sum + thread.comments.length, 0)
                }
            };
            this.logger.info(`Mapping completed: ${result.stats.threadsCreated} threads, ${result.stats.commentsCreated} comments`);
            return result;
        }
        catch (error) {
            const normalizedError = this.errorHandler.normalizeError(error);
            normalizedError.message = `Failed to map review results to comment threads: ${normalizedError.message}`;
            throw normalizedError;
        }
    }
    /**
     * Group findings by file and line
     */
    groupFindings(findings, options) {
        const grouped = new Map();
        // Sort findings by severity and line number
        const sortedFindings = [...findings].sort((a, b) => {
            // Sort by severity (error > warning > info)
            const severityOrder = { error: 0, warning: 1, info: 2 };
            const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
            if (severityDiff !== 0)
                return severityDiff;
            // Then by file
            const fileDiff = a.file.localeCompare(b.file);
            if (fileDiff !== 0)
                return fileDiff;
            // Then by line number
            return a.line - b.line;
        });
        for (const finding of sortedFindings) {
            const key = options.groupBySeverity
                ? `${finding.file}:${finding.severity}`
                : `${finding.file}:${finding.line}`;
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key).push(finding);
        }
        return grouped;
    }
    /**
     * Create comment threads for a file
     */
    createThreadsForFile(fileKey, findings, options) {
        const threads = [];
        if (options.groupBySeverity) {
            // Group by severity - one thread per severity level
            const thread = this.createSeverityGroupThread(fileKey, findings, options);
            if (thread) {
                threads.push(thread);
            }
        }
        else {
            // Group by line - one thread per line/range
            const lineGroups = this.groupByLine(findings);
            for (const [lineKey, lineFindings] of lineGroups.entries()) {
                const thread = this.createLineThread(lineKey, lineFindings, options);
                if (thread) {
                    threads.push(thread);
                }
            }
        }
        return threads;
    }
    /**
     * Group findings by line
     */
    groupByLine(findings) {
        const grouped = new Map();
        for (const finding of findings) {
            const key = finding.endLine
                ? `${finding.line}-${finding.endLine}`
                : finding.line.toString();
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key).push(finding);
        }
        return grouped;
    }
    /**
     * Create thread for severity group
     */
    createSeverityGroupThread(fileKey, findings, options) {
        if (findings.length === 0)
            return null;
        const [filePath, severity] = fileKey.split(':');
        const firstFinding = findings[0];
        if (!firstFinding)
            return null;
        // Create thread context
        const threadContext = {
            filePath: filePath || '',
            rightFileStart: {
                line: firstFinding.line || 1,
                offset: 1
            },
            rightFileEnd: {
                line: firstFinding.endLine || firstFinding.line || 1,
                offset: 1
            }
        };
        // Create comments
        const comments = [];
        // Add header comment
        const headerContent = this.createSeverityHeaderContent(severity, findings.length);
        comments.push({
            content: headerContent,
            commentType: 'text',
            status: 'active',
            properties: {
                'ado-review.type': 'severity-header',
                'ado-review.severity': severity,
                'ado-review.count': findings.length
            }
        });
        // Add finding comments (limited)
        const limitedFindings = findings.slice(0, options.maxCommentsPerThread - 1);
        for (const finding of limitedFindings) {
            const comment = this.createFindingComment(finding, options);
            comments.push(comment);
        }
        // Add overflow comment if needed
        if (findings.length > limitedFindings.length) {
            const overflowCount = findings.length - limitedFindings.length;
            comments.push({
                content: `... and ${overflowCount} more ${severity} issue(s) in this file`,
                commentType: 'text',
                status: 'active',
                properties: {
                    'ado-review.type': 'overflow',
                    'ado-review.count': overflowCount
                }
            });
        }
        return {
            threadContext,
            comments,
            status: 'active',
            properties: {
                'ado-review.type': 'severity-group',
                'ado-review.severity': severity,
                'ado-review.file': filePath
            }
        };
    }
    /**
     * Create thread for line group
     */
    createLineThread(lineKey, findings, options) {
        if (findings.length === 0)
            return null;
        const firstFinding = findings[0];
        if (!firstFinding)
            return null;
        const parts = lineKey.includes('-') ? lineKey.split('-') : [lineKey, lineKey];
        const startLineStr = parts[0] || '1';
        const endLineStr = parts[1] || startLineStr;
        const startLine = parseInt(startLineStr);
        const endLine = parseInt(endLineStr);
        if (isNaN(startLine) || isNaN(endLine)) {
            this.logger.warn(`Invalid line key: ${lineKey}`);
            return null;
        }
        // Create thread context
        const threadContext = {
            filePath: firstFinding.file || '',
            rightFileStart: {
                line: startLine,
                offset: 1
            },
            rightFileEnd: {
                line: endLine,
                offset: 1
            }
        };
        // Create comments
        const comments = [];
        // Add finding comments (limited)
        const limitedFindings = findings.slice(0, options.maxCommentsPerThread);
        for (const finding of limitedFindings) {
            const comment = this.createFindingComment(finding, options);
            comments.push(comment);
        }
        // Add overflow comment if needed
        if (findings.length > limitedFindings.length) {
            const overflowCount = findings.length - limitedFindings.length;
            comments.push({
                content: `... and ${overflowCount} more issue(s) on this line`,
                commentType: 'text',
                status: 'active',
                properties: {
                    'ado-review.type': 'overflow',
                    'ado-review.count': overflowCount
                }
            });
        }
        return {
            threadContext,
            comments,
            status: 'active',
            properties: {
                'ado-review.type': 'line-group',
                'ado-review.line': lineKey,
                'ado-review.file': firstFinding?.file || ''
            }
        };
    }
    /**
     * Create severity header content
     */
    createSeverityHeaderContent(severity, count) {
        const emoji = {
            error: '🚨',
            warning: '⚠️',
            info: 'ℹ️'
        };
        const severityText = severity.charAt(0).toUpperCase() + severity.slice(1);
        return `${emoji[severity]} **${count} ${severityText}${count > 1 ? 's' : ''} Found**\n\nThe following ${severity} issue${count > 1 ? 's were' : ' was'} identified in this file:`;
    }
    /**
     * Create comment for a finding
     */
    createFindingComment(finding, options) {
        const parts = [];
        // Severity indicator
        const severityEmoji = {
            error: '🚨',
            warning: '⚠️',
            info: 'ℹ️'
        };
        const severityText = finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1);
        parts.push(`${severityEmoji[finding.severity]} **${severityText}**`);
        // Main message
        parts.push(finding.message);
        // Rule ID and category
        const metadata = [];
        if (options.includeRuleId && finding.ruleId) {
            metadata.push(`Rule: \`${finding.ruleId}\``);
        }
        if (options.includeCategory && finding.category) {
            metadata.push(`Category: \`${finding.category}\``);
        }
        if (metadata.length > 0) {
            parts.push(`\n*${metadata.join(' • ')}*`);
        }
        // Suggestion
        if (options.includeSuggestions && finding.suggestion) {
            parts.push(`\n**Suggestion:** ${finding.suggestion}`);
        }
        // Line information
        const lineInfo = finding.endLine && finding.endLine !== finding.line
            ? `Lines ${finding.line}-${finding.endLine}`
            : `Line ${finding.line}`;
        parts.push(`\n*${lineInfo}*`);
        return {
            content: parts.join('\n'),
            commentType: 'text',
            status: 'active',
            properties: {
                'ado-review.type': 'finding',
                'ado-review.severity': finding.severity,
                'ado-review.line': finding.line,
                'ado-review.endLine': finding.endLine,
                'ado-review.ruleId': finding.ruleId,
                'ado-review.category': finding.category
            }
        };
    }
    /**
     * Create summary comment
     */
    createSummaryComment(reviewResult, mappedCount, skippedCount) {
        const { findings, summary, metadata } = reviewResult;
        const parts = [];
        // Header
        parts.push('# 🤖 AI Code Review Summary');
        parts.push('');
        // Overall summary
        if (summary) {
            parts.push(summary);
            parts.push('');
        }
        // Statistics
        parts.push('## 📊 Review Statistics');
        parts.push('');
        parts.push(`- **Total Issues Found:** ${findings.length}`);
        parts.push(`- **Issues Commented:** ${mappedCount}`);
        if (skippedCount > 0) {
            parts.push(`- **Issues Skipped:** ${skippedCount} (due to limits)`);
        }
        if (metadata) {
            parts.push(`- **Files Reviewed:** ${metadata.reviewedFiles}`);
            parts.push(`- **Lines Reviewed:** ${metadata.reviewedLines}`);
        }
        // Severity breakdown
        if (metadata?.issuesBySeverity) {
            parts.push('');
            parts.push('## 🎯 Issues by Severity');
            parts.push('');
            const { error = 0, warning = 0, info = 0 } = metadata.issuesBySeverity;
            if (error > 0) {
                parts.push(`- 🚨 **Errors:** ${error}`);
            }
            if (warning > 0) {
                parts.push(`- ⚠️ **Warnings:** ${warning}`);
            }
            if (info > 0) {
                parts.push(`- ℹ️ **Info:** ${info}`);
            }
        }
        // Footer
        parts.push('');
        parts.push('---');
        parts.push('*Generated by ADO Review CLI with AI assistance*');
        return {
            content: parts.join('\n'),
            commentType: 'text',
            status: 'active',
            properties: {
                'ado-review.type': 'summary',
                'ado-review.totalFindings': findings.length,
                'ado-review.mappedFindings': mappedCount,
                'ado-review.skippedFindings': skippedCount
            }
        };
    }
    /**
     * Validate comment thread
     */
    validateCommentThread(thread) {
        try {
            // Check required fields
            if (!thread.comments || thread.comments.length === 0) {
                this.logger.debug('Thread has no comments');
                return false;
            }
            // Check thread context
            if (!thread.threadContext || !thread.threadContext.filePath) {
                this.logger.debug('Thread missing context or file path');
                return false;
            }
            // Validate line numbers
            const { rightFileStart, rightFileEnd } = thread.threadContext;
            if (!rightFileStart || !rightFileEnd ||
                rightFileStart.line < 1 || rightFileEnd.line < rightFileStart.line) {
                this.logger.debug('Thread has invalid line numbers');
                return false;
            }
            // Validate comments
            for (const comment of thread.comments) {
                if (!comment.content || comment.content.trim().length === 0) {
                    this.logger.debug('Thread has empty comment');
                    return false;
                }
            }
            return true;
        }
        catch (error) {
            this.logger.debug(`Thread validation failed: ${error.message}`);
            return false;
        }
    }
    /**
     * Get mapping statistics
     */
    getStatistics(result) {
        const { stats } = result;
        const lines = [
            `Total findings: ${stats.totalFindings}`,
            `Mapped findings: ${stats.mappedFindings}`,
            `Threads created: ${stats.threadsCreated}`,
            `Comments created: ${stats.commentsCreated}`
        ];
        if (stats.skippedFindings > 0) {
            lines.push(`Skipped findings: ${stats.skippedFindings}`);
        }
        return lines.join(', ');
    }
    /**
     * Get mapper summary
     */
    getSummary() {
        return 'Result mapper for converting review findings to ADO comment threads';
    }
}
exports.ResultMapper = ResultMapper;
//# sourceMappingURL=resultMapper.js.map