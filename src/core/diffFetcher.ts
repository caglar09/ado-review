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
   */
  public async fetchPullRequestDiff(
    pullRequestId: number,
    workingDirectory?: string
  ): Promise<PullRequestDiff> {
    try {
      this.logger.info(`Fetching diff for PR ${pullRequestId}`);

      // Get PR iterations
      const iterations = await this.adoClient.getPullRequestIterations(pullRequestId);
      if (iterations.length === 0) {
        throw new Error('No iterations found for pull request');
      }

      // Get the latest iteration
      const latestIteration = iterations[iterations.length - 1];
      if (!latestIteration) {
        throw new Error('No valid iteration found for pull request');
      }
      this.logger.debug(`Using iteration ${latestIteration.id} for diff`);

      // Get file changes from the latest iteration
      const fileChanges = await this.adoClient.getIterationChanges(
        pullRequestId,
        latestIteration.id
      );

      this.logger.debug(`Found ${fileChanges.length} file changes`);

      // Process each file change
      const fileDiffs: FileDiff[] = [];
      let totalAddedLines = 0;
      let totalDeletedLines = 0;

      for (const fileChange of fileChanges) {
        if (fileChange.item.isFolder) {
          continue; // Skip folders
        }

        try {
          const fileDiff = await this.processFileChange(
            fileChange,
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
          this.logger.warn(`Failed to process file ${fileChange.item.path}: ${(error as Error).message}`);
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
   * Process individual file change
   */
  private async processFileChange(
    fileChange: FileChange,
    iteration: PullRequestIteration,
    workingDirectory?: string
  ): Promise<FileDiff | null> {
    const filePath = fileChange.item.path;
    
    this.logger.debug(`Processing file change: ${filePath} (${fileChange.changeType})`);

    // Determine change type
    const changeType = this.mapChangeType(fileChange.changeType);
    
    // Check if file is binary
    const isBinary = this.isBinaryFile(filePath);
    const isText = !isBinary;

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

    // Get diff content
    let diffContent = '';
    
    try {
      // Try to get actual file contents from Azure DevOps API
      diffContent = await this.createRealDiff(fileChange, iteration);
    } catch (error) {
      this.logger.warn(`Failed to get real diff for ${filePath}: ${(error as Error).message}`);
      
      if (workingDirectory) {
        // Use git to get diff if working directory is available
        try {
          diffContent = await this.gitManager.getDiff(
            workingDirectory,
            iteration.targetRefCommit.commitId,
            iteration.sourceRefCommit.commitId,
            filePath
          );
        } catch (gitError) {
          this.logger.warn(`Failed to get git diff for ${filePath}: ${(gitError as Error).message}`);
          // Fall back to basic diff representation
          diffContent = this.createBasicDiff(fileChange, iteration);
        }
      } else {
        // Fall back to basic diff representation
        diffContent = this.createBasicDiff(fileChange, iteration);
      }
    }

    // Parse diff into hunks
    const hunks = this.parseDiffHunks(diffContent, filePath);

    return {
      filePath,
      changeType,
      hunks,
      isText,
      isBinary: false
    };
  }

  /**
   * Map ADO change type to our change type
   */
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

  /**
   * Check if file is binary based on extension
   */
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

  /**
   * Create basic diff representation when git is not available
   */
  /**
   * Create real diff using Azure DevOps API
   */
  private async createRealDiff(fileChange: FileChange, iteration: PullRequestIteration): Promise<string> {
    const filePath = fileChange.item.path;
    const changeType = fileChange.changeType.toLowerCase();
    
    this.logger.debug(`Creating real diff for ${filePath} (${changeType})`);
    
    let oldContent = '';
    let newContent = '';
    
    // Get file contents from both commits
    try {
      if (changeType !== 'add') {
        oldContent = await this.adoClient.getFileContent(filePath, iteration.targetRefCommit.commitId);
      }
      
      if (changeType !== 'delete') {
        newContent = await this.adoClient.getFileContent(filePath, iteration.sourceRefCommit.commitId);
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch file contents for ${filePath}: ${(error as Error).message}`);
      throw error;
    }
    
    // Generate unified diff
    return this.generateUnifiedDiff(filePath, oldContent, newContent, iteration);
  }

  /**
   * Generate unified diff format
   */
  private generateUnifiedDiff(
    filePath: string,
    oldContent: string,
    newContent: string,
    iteration: PullRequestIteration
  ): string {
    const oldLines = oldContent ? oldContent.split('\n') : [];
    const newLines = newContent ? newContent.split('\n') : [];
    
    let diff = `diff --git a/${filePath} b/${filePath}\n`;
    diff += `index ${iteration.targetRefCommit.commitId.substring(0, 7)}..${iteration.sourceRefCommit.commitId.substring(0, 7)}\n`;
    
    if (!oldContent && newContent) {
      // File added
      diff += `--- /dev/null\n`;
      diff += `+++ b/${filePath}\n`;
      diff += `@@ -0,0 +1,${newLines.length} @@\n`;
      for (const line of newLines) {
        diff += `+${line}\n`;
      }
    } else if (oldContent && !newContent) {
      // File deleted
      diff += `--- a/${filePath}\n`;
      diff += `+++ /dev/null\n`;
      diff += `@@ -1,${oldLines.length} +0,0 @@\n`;
      for (const line of oldLines) {
        diff += `-${line}\n`;
      }
    } else {
      // File modified - create a simple diff
      diff += `--- a/${filePath}\n`;
      diff += `+++ b/${filePath}\n`;
      
      // For simplicity, show all old lines as removed and all new lines as added
      // A more sophisticated diff algorithm could be implemented here
      const maxLines = Math.max(oldLines.length, newLines.length);
      if (maxLines > 0) {
        diff += `@@ -1,${oldLines.length} +1,${newLines.length} @@\n`;
        
        // Show removed lines
        for (const line of oldLines) {
          diff += `-${line}\n`;
        }
        
        // Show added lines
        for (const line of newLines) {
          diff += `+${line}\n`;
        }
      }
    }
    
    return diff;
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

  /**
   * Parse diff content into hunks
   */
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

  /**
   * Determine hunk change type based on content
   */
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

  /**
   * Filter diffs based on file patterns
   */
  public filterDiffs(
    pullRequestDiff: PullRequestDiff,
    includePatterns?: string[],
    excludePatterns?: string[],
    specificFiles?: string[]
  ): PullRequestDiff {
    let filteredFiles = pullRequestDiff.files;
    
    // Filter by specific files if provided
    if (specificFiles && specificFiles.length > 0) {
      filteredFiles = filteredFiles.filter(file => 
        specificFiles.includes(file.filePath)
      );
    } else {
      // Apply include/exclude patterns
      filteredFiles = this.gitManager.filterFiles(
        filteredFiles.map(f => f.filePath),
        includePatterns,
        excludePatterns
      ).map(filePath => 
        pullRequestDiff.files.find(f => f.filePath === filePath)!
      ).filter(Boolean);
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

  /**
   * Get summary of changes
   */
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