import { ADOClient, PullRequestIteration, FileChange } from './adoClient';
import { GitManager } from './gitManager';
import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';

export interface DiffHunk {
  filePath: string;
  changeType: 'add' | 'edit' | 'delete' | 'rename';
  oldLineStart: number;
  oldLineCount: number;
  newLineStart: number;
  newLineCount: number;
  content: string;
  context: string;
}

export interface FileDiff {
  filePath: string;
  changeType: 'add' | 'edit' | 'delete' | 'rename';
  oldPath?: string;
  hunks: DiffHunk[];
  isText: boolean;
  isBinary: boolean;
}

export interface PullRequestDiff {
  pullRequestId: number;
  sourceCommit: string;
  targetCommit: string;
  files: FileDiff[];
  totalChanges: number;
  addedLines: number;
  deletedLines: number;
}

export class DiffFetcher {
  private adoClient: ADOClient;
  private gitManager: GitManager;
  private logger: Logger;
  private errorHandler: ErrorHandler;

  constructor(
    adoClient: ADOClient,
    gitManager: GitManager,
    logger: Logger,
    errorHandler: ErrorHandler
  ) {
    this.adoClient = adoClient;
    this.gitManager = gitManager;
    this.logger = logger;
    this.errorHandler = errorHandler;
  }

  /**
   * Fetch pull request diff using iteration changes API
   * This gets the changes from the PR iterations which matches the manual API data
   */
  public async fetchPullRequestDiff(
    pullRequestId: number,
    workingDirectory?: string
  ): Promise<PullRequestDiff> {
    try {
      this.logger.info(`Fetching iteration changes for PR ${pullRequestId}`);

      // Get PR iterations for commit info
      const iterations = await this.adoClient.getPullRequestIterations(pullRequestId);
      if (iterations.length === 0) {
        throw new Error('No iterations found for pull request');
      }

      const latestIteration = iterations[iterations.length - 1];
      if (!latestIteration) {
        throw new Error('No valid iteration found for pull request');
      }

      // Get iteration changes instead of final diff
      const iterationChanges = await this.adoClient.getIterationChanges(
        pullRequestId,
        latestIteration.id
      );
      
      this.logger.debug(`Processing iteration changes with ${iterationChanges.length} file changes`);

      // Process each file change from iteration changes
      const fileDiffs: FileDiff[] = [];
      let totalAddedLines = 0;
      let totalDeletedLines = 0;

      for (const change of iterationChanges) {
        if (change.item?.isFolder) {
          continue; // Skip folders
        }

        try {
          const fileDiff = await this.processIterationChange(
            change,
            latestIteration,
            workingDirectory
          );
        
          if (fileDiff) {
            fileDiffs.push(fileDiff);
              
            // Count lines
            for (const hunk of fileDiff.hunks) {
              const lines = hunk.content.split('\n');
              for (const line of lines) {
                if (line.startsWith('+') && !line.startsWith('+++')) {
                  totalAddedLines++;
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                  totalDeletedLines++;
                }
              }
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to process file ${change.item?.path}: ${(error as Error).message}`);
          // Continue with other files
        }
      }

      const pullRequestDiff: PullRequestDiff = {
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
    } catch (error) {
      const reviewError = this.errorHandler.normalizeError(error);
      if (reviewError.context) {
        reviewError.context = {
          ...reviewError.context,
          operation: 'fetchPullRequestDiff',
          component: 'DiffFetcher',
          metadata: { pullRequestId }
        };
      } else {
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
   * Process individual file change from iteration changes
   */
  private async processIterationChange(
    change: FileChange,
    iteration: PullRequestIteration,
    workingDirectory?: string
  ): Promise<FileDiff | null> {
    const filePath = change.item?.path;
    if (!filePath) {
      return null;
    }

    this.logger.debug(`Processing iteration change for file: ${filePath}`);

    const changeType = this.mapChangeType(change.changeType || 'edit');
    const isText = !this.isBinaryFile(filePath);
    const isBinary = !isText;

    if (isBinary) {
      return {
        filePath,
        changeType,
        hunks: [],
        isText: false,
        isBinary: true
      };
    }

    // For iteration changes, we need to create a basic diff since we don't have the actual diff content
    // This matches the format that would come from the manual API call
    let diffContent: string;
    
    try {
      // Try to get actual diff content if working directory is available
      if (workingDirectory) {
        // Remove leading slash from filePath for git diff command
        const normalizedFilePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
        diffContent = await this.gitManager.getDiff(
          workingDirectory,
          iteration.targetRefCommit.commitId,
          iteration.sourceRefCommit.commitId,
          normalizedFilePath
        );
      } else {
        // Fallback to basic diff
        diffContent = this.createBasicDiff(change, iteration);
      }
    } catch (error) {
      this.logger.debug(`Could not get git diff for ${filePath}, using basic diff: ${(error as Error).message}`);
      diffContent = this.createBasicDiff(change, iteration);
    }

    const hunks = this.parseDiffHunks(diffContent, filePath);

    const fileDiff: FileDiff = {
      filePath,
      changeType,
      hunks,
      isText: true,
      isBinary: false
    };

    if (changeType === 'rename') {
      fileDiff.oldPath = filePath;
    }

    return fileDiff;
  }

  private mapChangeType(adoChangeType: string): 'add' | 'edit' | 'delete' | 'rename' {
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

  private isBinaryFile(filePath: string): boolean {
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

  private createBasicDiff(fileChange: FileChange, iteration: PullRequestIteration): string {
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

  private parseDiffHunks(diffContent: string, filePath: string): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    const lines = diffContent.split('\n');
    
    let currentHunk: Partial<DiffHunk> | null = null;
    let hunkLines: string[] = [];
    
    for (const line of lines) {
      // Check for hunk header
      const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
      
      if (hunkMatch) {
        // Save previous hunk if exists
        if (currentHunk && hunkLines.length > 0) {
          hunks.push({
            filePath,
            changeType: this.determineHunkChangeType(hunkLines),
            oldLineStart: currentHunk.oldLineStart!,
            oldLineCount: currentHunk.oldLineCount!,
            newLineStart: currentHunk.newLineStart!,
            newLineCount: currentHunk.newLineCount!,
            content: hunkLines.join('\n'),
            context: currentHunk.context!
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
      } else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
        // Add line to current hunk
        hunkLines.push(line);
      }
    }
    
    // Save last hunk
    if (currentHunk && hunkLines.length > 0) {
      hunks.push({
        filePath,
        changeType: this.determineHunkChangeType(hunkLines),
        oldLineStart: currentHunk.oldLineStart!,
        oldLineCount: currentHunk.oldLineCount!,
        newLineStart: currentHunk.newLineStart!,
        newLineCount: currentHunk.newLineCount!,
        content: hunkLines.join('\n'),
        context: currentHunk.context!
      });
    }
    
    return hunks;
  }

  private determineHunkChangeType(hunkLines: string[]): 'add' | 'edit' | 'delete' | 'rename' {
    const hasAdditions = hunkLines.some(line => line.startsWith('+'));
    const hasDeletions = hunkLines.some(line => line.startsWith('-'));
    
    if (hasAdditions && hasDeletions) {
      return 'edit';
    } else if (hasAdditions) {
      return 'add';
    } else if (hasDeletions) {
      return 'delete';
    } else {
      return 'edit';
    }
  }

  public filterDiffs(
    pullRequestDiff: PullRequestDiff,
    _includePatterns?: string[],
    _excludePatterns?: string[],
    specificFiles?: string[]
  ): PullRequestDiff {
    let filteredFiles = pullRequestDiff.files;
    
    // Filter by specific files if provided
    if (specificFiles && specificFiles.length > 0) {
      filteredFiles = filteredFiles.filter(file => 
        specificFiles.some(pattern => 
          file.filePath.includes(pattern) || 
          file.filePath.match(new RegExp(pattern.replace(/\*/g, '.*')))
        )
      );
    }
    
    // Apply include/exclude patterns
    // TODO: Implement pattern matching logic
    
    // Recalculate totals
    let addedLines = 0;
    let deletedLines = 0;
    
    for (const file of filteredFiles) {
      for (const hunk of file.hunks) {
        const lines = hunk.content.split('\n');
        for (const line of lines) {
          if (line.startsWith('+') && !line.startsWith('+++')) {
            addedLines++;
          } else if (line.startsWith('-') && !line.startsWith('---')) {
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

  public getSummary(pullRequestDiff: PullRequestDiff): string {
    const { files, addedLines, deletedLines } = pullRequestDiff;
    
    const filesByType = files.reduce((acc, file) => {
      acc[file.changeType] = (acc[file.changeType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const parts = [];
    if (filesByType['add']) parts.push(`${filesByType['add']} added`);
    if (filesByType['edit']) parts.push(`${filesByType['edit']} modified`);
    if (filesByType['delete']) parts.push(`${filesByType['delete']} deleted`);
    if (filesByType['rename']) parts.push(`${filesByType['rename']} renamed`);
    
    return `${files.length} files (${parts.join(', ')}), +${addedLines}/-${deletedLines} lines`;
  }
}