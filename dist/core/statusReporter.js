"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusReporter = void 0;
class StatusReporter {
    constructor(logger, errorHandler, adoClient) {
        this.logger = logger;
        this.errorHandler = errorHandler;
        this.adoClient = adoClient;
        this.defaultOptions = {
            enabled: true,
            statusName: 'ado-review/code-review',
            description: 'AI-powered code review',
            genre: 'continuous-integration',
            updateExisting: true,
            retryAttempts: 3,
            retryDelay: 1000
        };
    }
    /**
     * Set PR status to pending (review started)
     */
    async setPending(pullRequestId, options = {}) {
        const opts = { ...this.defaultOptions, ...options };
        if (!opts.enabled) {
            this.logger.debug('Status reporting is disabled');
            return { success: true, message: 'Status reporting disabled' };
        }
        try {
            this.logger.debug(`Setting PR ${pullRequestId} status to pending`);
            const status = {
                state: 'pending',
                description: opts.description + ' - Review in progress',
                context: {
                    name: opts.statusName,
                    genre: opts.genre
                },
                ...(opts.targetUrl && { targetUrl: opts.targetUrl }),
                ...(opts.iterationId && { iterationId: opts.iterationId })
            };
            const result = await this.postStatus(pullRequestId, status, opts);
            if (result.success) {
                this.logger.info(`PR ${pullRequestId} status set to pending`);
            }
            return result;
        }
        catch (error) {
            return this.handleStatusError(error, 'setPending', pullRequestId);
        }
    }
    /**
     * Set PR status to success (review completed successfully)
     */
    async setSuccess(pullRequestId, summary, options = {}) {
        const opts = { ...this.defaultOptions, ...options };
        if (!opts.enabled) {
            this.logger.debug('Status reporting is disabled');
            return { success: true, message: 'Status reporting disabled' };
        }
        try {
            this.logger.debug(`Setting PR ${pullRequestId} status to success`);
            const description = this.buildSuccessDescription(summary, opts.description);
            const status = {
                state: 'succeeded',
                description,
                context: {
                    name: opts.statusName,
                    genre: opts.genre
                },
                ...(opts.targetUrl && { targetUrl: opts.targetUrl }),
                ...(opts.iterationId && { iterationId: opts.iterationId })
            };
            const result = await this.postStatus(pullRequestId, status, opts);
            if (result.success) {
                this.logger.info(`PR ${pullRequestId} status set to success: ${description}`);
            }
            return result;
        }
        catch (error) {
            return this.handleStatusError(error, 'setSuccess', pullRequestId);
        }
    }
    /**
     * Set PR status to failed (review completed with critical issues)
     */
    async setFailed(pullRequestId, summary, options = {}) {
        const opts = { ...this.defaultOptions, ...options };
        if (!opts.enabled) {
            this.logger.debug('Status reporting is disabled');
            return { success: true, message: 'Status reporting disabled' };
        }
        try {
            this.logger.debug(`Setting PR ${pullRequestId} status to failed`);
            const description = this.buildFailedDescription(summary, opts.description);
            const status = {
                state: 'failed',
                description,
                context: {
                    name: opts.statusName,
                    genre: opts.genre
                },
                ...(opts.targetUrl && { targetUrl: opts.targetUrl }),
                ...(opts.iterationId && { iterationId: opts.iterationId })
            };
            const result = await this.postStatus(pullRequestId, status, opts);
            if (result.success) {
                this.logger.info(`PR ${pullRequestId} status set to failed: ${description}`);
            }
            return result;
        }
        catch (error) {
            return this.handleStatusError(error, 'setFailed', pullRequestId);
        }
    }
    /**
     * Set PR status to error (review failed due to technical issues)
     */
    async setError(pullRequestId, errorMessage, options = {}) {
        const opts = { ...this.defaultOptions, ...options };
        if (!opts.enabled) {
            this.logger.debug('Status reporting is disabled');
            return { success: true, message: 'Status reporting disabled' };
        }
        try {
            this.logger.debug(`Setting PR ${pullRequestId} status to error`);
            const description = `${opts.description} - Error: ${this.truncateMessage(errorMessage, 200)}`;
            const status = {
                state: 'error',
                description,
                context: {
                    name: opts.statusName,
                    genre: opts.genre
                },
                ...(opts.targetUrl && { targetUrl: opts.targetUrl }),
                ...(opts.iterationId && { iterationId: opts.iterationId })
            };
            const result = await this.postStatus(pullRequestId, status, opts);
            if (result.success) {
                this.logger.info(`PR ${pullRequestId} status set to error: ${description}`);
            }
            return result;
        }
        catch (error) {
            return this.handleStatusError(error, 'setError', pullRequestId);
        }
    }
    /**
     * Get current PR statuses
     */
    async getStatuses(pullRequestId, iterationId) {
        try {
            this.logger.debug(`Getting statuses for PR ${pullRequestId}`);
            const statuses = await this.adoClient.getPullRequestStatuses(pullRequestId, iterationId);
            return statuses.map((status) => ({
                id: status.id,
                state: status.state,
                description: status.description,
                context: status.context,
                targetUrl: status.targetUrl,
                iterationId: status.iterationId,
                createdBy: status.createdBy,
                creationDate: status.creationDate,
                updatedDate: status.updatedDate
            }));
        }
        catch (error) {
            throw this.errorHandler.createFromError(error, 'Failed to get PR statuses');
        }
    }
    /**
     * Find existing status by name
     */
    async findExistingStatus(pullRequestId, statusName, iterationId) {
        try {
            const statuses = await this.getStatuses(pullRequestId, iterationId);
            return statuses.find(status => status.context.name === statusName &&
                (!iterationId || status.iterationId === iterationId));
        }
        catch (error) {
            this.logger.warn(`Failed to find existing status: ${error.message}`);
            return undefined;
        }
    }
    /**
     * Post status with retry logic
     */
    async postStatus(pullRequestId, status, options) {
        try {
            // Check if we should update existing status
            if (options.updateExisting) {
                const existingStatus = await this.findExistingStatus(pullRequestId, status.context.name, status.iterationId);
                if (existingStatus) {
                    this.logger.debug(`Updating existing status ${existingStatus.id}`);
                    // Update existing status
                    const updatedStatus = await this.retryOperation(() => this.adoClient.updatePullRequestStatus(pullRequestId, String(existingStatus.id), status.state, status.description), options.retryAttempts, options.retryDelay, 'update status');
                    return {
                        success: true,
                        statusId: updatedStatus?.id || existingStatus.id,
                        message: `Status updated: ${status.description}`
                    };
                }
            }
            // Create new status
            const newStatus = await this.retryOperation(() => this.adoClient.createPullRequestStatus(pullRequestId, status), options.retryAttempts, options.retryDelay, 'create status');
            return {
                success: true,
                statusId: newStatus?.id || 'unknown',
                message: `Status created: ${status.description}`
            };
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Build success description
     */
    buildSuccessDescription(summary, baseDescription) {
        const parts = [baseDescription];
        if (summary.totalFindings === 0) {
            parts.push('- No issues found');
        }
        else {
            const findings = [];
            if (summary.criticalFindings > 0)
                findings.push(`${summary.criticalFindings} critical`);
            if (summary.majorFindings > 0)
                findings.push(`${summary.majorFindings} major`);
            if (summary.minorFindings > 0)
                findings.push(`${summary.minorFindings} minor`);
            if (summary.infoFindings > 0)
                findings.push(`${summary.infoFindings} info`);
            parts.push(`- ${findings.join(', ')} issues found`);
        }
        parts.push(`- ${summary.filesReviewed} files reviewed`);
        return this.truncateMessage(parts.join(' '), 400);
    }
    /**
     * Build failed description
     */
    buildFailedDescription(summary, baseDescription) {
        const parts = [baseDescription];
        if (summary.criticalFindings > 0) {
            parts.push(`- ${summary.criticalFindings} critical issues must be addressed`);
        }
        if (summary.majorFindings > 0) {
            parts.push(`- ${summary.majorFindings} major issues found`);
        }
        parts.push(`- ${summary.totalFindings} total issues in ${summary.filesReviewed} files`);
        return this.truncateMessage(parts.join(' '), 400);
    }
    /**
     * Truncate message to fit Azure DevOps limits
     */
    truncateMessage(message, maxLength) {
        if (message.length <= maxLength) {
            return message;
        }
        return message.substring(0, maxLength - 3) + '...';
    }
    /**
     * Handle status operation errors
     */
    handleStatusError(error, operation, pullRequestId) {
        const errorMessage = `Failed to ${operation} for PR ${pullRequestId}: ${error.message}`;
        this.logger.error(errorMessage);
        return {
            success: false,
            message: errorMessage,
            error: error.message
        };
    }
    /**
     * Retry operation with exponential backoff
     */
    async retryOperation(operation, maxAttempts, baseDelay, operationName) {
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
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
        throw lastError;
    }
    /**
     * Check if error is retryable
     */
    isRetryableError(error) {
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
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Create review summary from results
     */
    createSummary(findings, filesReviewed, linesReviewed, reviewDuration, errors = []) {
        const summary = {
            totalFindings: findings.length,
            criticalFindings: findings.filter(f => f.severity === 'critical').length,
            majorFindings: findings.filter(f => f.severity === 'major').length,
            minorFindings: findings.filter(f => f.severity === 'minor').length,
            infoFindings: findings.filter(f => f.severity === 'info').length,
            filesReviewed,
            linesReviewed,
            reviewDuration,
            success: errors.length === 0,
            errors
        };
        return summary;
    }
    /**
     * Determine if review should be marked as failed
     */
    shouldMarkAsFailed(summary) {
        // Mark as failed if there are critical issues or too many major issues
        return summary.criticalFindings > 0 || summary.majorFindings > 10;
    }
    /**
     * Get status reporter summary
     */
    getSummary() {
        return 'PR status reporter for Azure DevOps';
    }
    /**
     * Validate status options
     */
    validateOptions(options) {
        const errors = [];
        if (options.statusName && options.statusName.trim().length === 0) {
            errors.push('Status name cannot be empty');
        }
        if (options.description && options.description.trim().length === 0) {
            errors.push('Description cannot be empty');
        }
        if (options.description && options.description.length > 400) {
            errors.push('Description cannot exceed 400 characters');
        }
        if (options.targetUrl && !this.isValidUrl(options.targetUrl)) {
            errors.push('Target URL must be a valid URL');
        }
        if (options.retryAttempts !== undefined && (options.retryAttempts < 0 || options.retryAttempts > 10)) {
            errors.push('Retry attempts must be between 0 and 10');
        }
        if (options.retryDelay !== undefined && (options.retryDelay < 0 || options.retryDelay > 60000)) {
            errors.push('Retry delay must be between 0 and 60000 milliseconds');
        }
        return {
            valid: errors.length === 0,
            errors
        };
    }
    /**
     * Check if URL is valid
     */
    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.StatusReporter = StatusReporter;
//# sourceMappingURL=statusReporter.js.map