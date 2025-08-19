"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiffFetcher = void 0;
class DiffFetcher {
    adoClient;
    gitManager;
    logger;
    errorHandler;
    constructor(adoClient, gitManager, logger, errorHandler) {
        this.adoClient = adoClient;
        this.gitManager = gitManager;
        this.logger = logger;
        this.errorHandler = errorHandler;
    }
    /**
     * Fetch pull request diff using final diff API
     * This gets only the net changes after all commits are applied
     */
    async fetchPullRequestDiff(pullRequestId, workingDirectory) {
        try {
            this.logger.info(`Fetching final diff for PR ${pullRequestId}`);
            // Get the final diff between source and target commits
            const finalDiffData = await this.adoClient.getPullRequestFinalDiff(pullRequestId);
            // Get PR iterations for commit info
            const iterations = await this.adoClient.getPullRequestIterations(pullRequestId);
            if (iterations.length === 0) {
                throw new Error('No iterations found for pull request');
            }
            const latestIteration = iterations[iterations.length - 1];
            if (!latestIteration) {
                throw new Error('No valid iteration found for pull request');
            }
            this.logger.debug(`Processing final diff with ${finalDiffData.changes?.length || 0} file changes`);
            // Process each file change from final diff
            const fileDiffs = [];
            let totalAddedLines = 0;
            let totalDeletedLines = 0;
            if (finalDiffData.changes) {
                for (const change of finalDiffData.changes) {
                    if (change.item?.isFolder) {
                        continue; // Skip folders
                    }
                    try {
                        const fileDiff = await this.processFinalDiffChange(change, latestIteration, workingDirectory);
                        if (fileDiff) {
                            fileDiffs.push(fileDiff);
                            // Count lines
                            for (const hunk of fileDiff.hunks) {
                                const lines = hunk.content.split('\n');
                                for (const line of lines) {
                                    if (line.startsWith('+') && !line.startsWith('+++')) {
                                        totalAddedLines++;
                                    }
                                    else if (line.startsWith('-') && !line.startsWith('---')) {
                                        totalDeletedLines++;
                                    }
                                }
                            }
                        }
                    }
                    catch (error) {
                        this.logger.warn(`Failed to process file ${change.item?.path}: ${error.message}`);
                        // Continue with other files
                    }
                }
            }
            const pullRequestDiff = {
                pullRequestId,
                sourceCommit: latestIteration.sourceRefCommit.commitId,
                targetCommit: latestIteration.targetRefCommit.commitId,
                files: fileDiffs,
                totalChanges: fileDiffs.length,
                addedLines: totalAddedLines,
                deletedLines: totalDeletedLines
            };
            this.logger.info(`Successfully fetched diff: ${fileDiffs.length} files, +${totalAddedLines}/-${totalDeletedLines} lines`);
            return pullRequestDiff;
        }
        catch (error) {
            const reviewError = this.errorHandler.normalizeError(error);
            if (reviewError.context) {
                reviewError.context = {
                    ...reviewError.context,
                    operation: 'fetchPullRequestDiff',
                    component: 'DiffFetcher',
                    metadata: { pullRequestId }
                };
            }
            else {
                reviewError.context = {
                    operation: 'fetchPullRequestDiff',
                    component: 'DiffFetcher',
                    metadata: { pullRequestId }
                };
            }
            throw reviewError;
        }
    }
    /**
     * Process individual file change from final diff
     */
    async processFinalDiffChange(change, iteration, workingDirectory) {
        const filePath = change.item?.path;
        if (!filePath) {
            return null;
        }
        this.logger.debug(`Processing final diff change for file: ${filePath}`);
        const changeType = this.mapChangeType(change.changeType || 'edit');
        const isText = !this.isBinaryFile(filePath);
        const isBinary = !isText;
        if (isBinary) {
            this.logger.debug(`Skipping binary file: ${filePath}`);
            return {
                filePath,
                changeType,
                hunks: [],
                isText: false,
                isBinary: true
            };
        }
        try {
            // Use the diff content from the final diff API response
            let diffContent = '';
            if (change.hunks && Array.isArray(change.hunks)) {
                // Process hunks from final diff
                diffContent = change.hunks.map((hunk) => {
                    const header = `@@ -${hunk.originalStart},${hunk.originalLength} +${hunk.modifiedStart},${hunk.modifiedLength} @@`;
                    const lines = hunk.lines?.map((line) => {
                        const prefix = line.changeType === 'add' ? '+' : line.changeType === 'delete' ? '-' : ' ';
                        return prefix + line.line;
                    }).join('\n') || '';
                    return header + '\n' + lines;
                }).join('\n');
            }
            else {
                // Try to get real diff using git if working directory is available
                if (workingDirectory) {
                    try {
                        this.logger.debug(`Attempting to get git diff for ${filePath}`);
                        diffContent = await this.gitManager.getDiff(workingDirectory, iteration.targetRefCommit.commitId, iteration.sourceRefCommit.commitId, filePath);
                        this.logger.debug(`Successfully retrieved git diff for ${filePath}`);
                    }
                    catch (gitError) {
                        this.logger.warn(`Failed to get git diff for ${filePath}: ${gitError.message}`);
                        // Fallback to basic diff if git fails
                        diffContent = this.createBasicDiff({ item: change.item, changeType: change.changeType }, iteration);
                    }
                }
                else {
                    // Fallback to basic diff if working directory is not available
                    diffContent = this.createBasicDiff({ item: change.item, changeType: change.changeType }, iteration);
                }
            }
            const hunks = this.parseDiffHunks(diffContent, filePath);
            return {
                filePath,
                changeType,
                oldPath: change.originalPath,
                hunks,
                isText: true,
                isBinary: false
            };
        }
        catch (error) {
            this.logger.warn(`Failed to create diff for ${filePath}: ${error.message}`);
            return null;
        }
    }
    /**
     * Map ADO change type to our change type
     */
    mapChangeType(adoChangeType) {
        switch (adoChangeType.toLowerCase()) {
            case 'add':
                return 'add';
            case 'edit':
                return 'edit';
            case 'delete':
                return 'delete';
            case 'rename':
                return 'rename';
            default:
                return 'edit';
        }
    }
    /**
     * Check if file is binary based on extension
     */
    isBinaryFile(filePath) {
        const binaryExtensions = [
            '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg',
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
            '.zip', '.rar', '.7z', '.tar', '.gz',
            '.exe', '.dll', '.so', '.dylib',
            '.mp3', '.mp4', '.avi', '.mov', '.wmv',
            '.ttf', '.otf', '.woff', '.woff2',
            '.bin', '.dat', '.db'
        ];
        const extension = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
        return binaryExtensions.includes(extension);
    }
    /**
     * Create basic diff representation when git is not available
     */
    /**
     * Create real diff using Azure DevOps API
     */
    createBasicDiff(fileChange, iteration) {
        const filePath = fileChange.item.path;
        const changeType = fileChange.changeType;
        let diff = `diff --git a/${filePath} b/${filePath}\n`;
        diff += `index ${iteration.targetRefCommit.commitId.substring(0, 7)}..${iteration.sourceRefCommit.commitId.substring(0, 7)}\n`;
        switch (changeType.toLowerCase()) {
            case 'add':
                diff += `--- /dev/null\n`;
                diff += `+++ b/${filePath}\n`;
                diff += `@@ -0,0 +1,1 @@\n`;
                diff += `+[File added - content not available without git]\n`;
                break;
            case 'delete':
                diff += `--- a/${filePath}\n`;
                diff += `+++ /dev/null\n`;
                diff += `@@ -1,1 +0,0 @@\n`;
                diff += `-[File deleted - content not available without git]\n`;
                break;
            default:
                diff += `--- a/${filePath}\n`;
                diff += `+++ b/${filePath}\n`;
                diff += `@@ -1,1 +1,1 @@\n`;
                diff += `-[Original content not available without git]\n`;
                diff += `+[Modified content not available without git]\n`;
                break;
        }
        return diff;
    }
    /**
     * Parse diff content into hunks
     */
    parseDiffHunks(diffContent, filePath) {
        const hunks = [];
        const lines = diffContent.split('\n');
        let currentHunk = null;
        let hunkLines = [];
        for (const line of lines) {
            // Check for hunk header
            const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
            if (hunkMatch) {
                // Save previous hunk if exists
                if (currentHunk && hunkLines.length > 0) {
                    hunks.push({
                        filePath,
                        changeType: this.determineHunkChangeType(hunkLines),
                        oldLineStart: currentHunk.oldLineStart,
                        oldLineCount: currentHunk.oldLineCount,
                        newLineStart: currentHunk.newLineStart,
                        newLineCount: currentHunk.newLineCount,
                        content: hunkLines.join('\n'),
                        context: currentHunk.context
                    });
                }
                // Start new hunk
                currentHunk = {
                    oldLineStart: parseInt(hunkMatch[1] || '0', 10),
                    oldLineCount: parseInt(hunkMatch[2] || '1', 10),
                    newLineStart: parseInt(hunkMatch[3] || '0', 10),
                    newLineCount: parseInt(hunkMatch[4] || '1', 10),
                    context: (hunkMatch[5] || '').trim()
                };
                hunkLines = [];
            }
            else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
                // Add line to current hunk
                hunkLines.push(line);
            }
        }
        // Save last hunk
        if (currentHunk && hunkLines.length > 0) {
            hunks.push({
                filePath,
                changeType: this.determineHunkChangeType(hunkLines),
                oldLineStart: currentHunk.oldLineStart,
                oldLineCount: currentHunk.oldLineCount,
                newLineStart: currentHunk.newLineStart,
                newLineCount: currentHunk.newLineCount,
                content: hunkLines.join('\n'),
                context: currentHunk.context
            });
        }
        return hunks;
    }
    /**
     * Determine hunk change type based on content
     */
    determineHunkChangeType(hunkLines) {
        const hasAdditions = hunkLines.some(line => line.startsWith('+'));
        const hasDeletions = hunkLines.some(line => line.startsWith('-'));
        if (hasAdditions && hasDeletions) {
            return 'edit';
        }
        else if (hasAdditions) {
            return 'add';
        }
        else if (hasDeletions) {
            return 'delete';
        }
        else {
            return 'edit';
        }
    }
    /**
     * Filter diffs based on file patterns
     */
    filterDiffs(pullRequestDiff, includePatterns, excludePatterns, specificFiles) {
        let filteredFiles = pullRequestDiff.files;
        // Filter by specific files if provided
        if (specificFiles && specificFiles.length > 0) {
            filteredFiles = filteredFiles.filter(file => specificFiles.includes(file.filePath));
        }
        else {
            // Apply include/exclude patterns
            filteredFiles = this.gitManager.filterFiles(filteredFiles.map(f => f.filePath), includePatterns, excludePatterns).map(filePath => pullRequestDiff.files.find(f => f.filePath === filePath)).filter(Boolean);
        }
        // Recalculate totals
        let addedLines = 0;
        let deletedLines = 0;
        for (const file of filteredFiles) {
            for (const hunk of file.hunks) {
                const lines = hunk.content.split('\n');
                for (const line of lines) {
                    if (line.startsWith('+') && !line.startsWith('+++')) {
                        addedLines++;
                    }
                    else if (line.startsWith('-') && !line.startsWith('---')) {
                        deletedLines++;
                    }
                }
            }
        }
        return {
            ...pullRequestDiff,
            files: filteredFiles,
            totalChanges: filteredFiles.length,
            addedLines,
            deletedLines
        };
    }
    /**
     * Get summary of changes
     */
    getSummary(pullRequestDiff) {
        const { files, addedLines, deletedLines } = pullRequestDiff;
        const filesByType = files.reduce((acc, file) => {
            acc[file.changeType] = (acc[file.changeType] || 0) + 1;
            return acc;
        }, {});
        const parts = [];
        if (filesByType['add'])
            parts.push(`${filesByType['add']} added`);
        if (filesByType['edit'])
            parts.push(`${filesByType['edit']} modified`);
        if (filesByType['delete'])
            parts.push(`${filesByType['delete']} deleted`);
        if (filesByType['rename'])
            parts.push(`${filesByType['rename']} renamed`);
        return `${files.length} files (${parts.join(', ')}), +${addedLines}/-${deletedLines} lines`;
    }
}
exports.DiffFetcher = DiffFetcher;
//# sourceMappingURL=diffFetcher.js.map