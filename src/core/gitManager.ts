import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';

export interface CloneOptions {
  branch: string;
  depth?: number;
  sparseCheckout?: string[];
  workingDirectory: string;
  additionalRefs?: string[];
}

export interface GitInfo {
  repositoryUrl: string;
  branch: string;
  commitId: string;
  workingDirectory: string;
}

export class GitManager {
  private logger: Logger;
  private errorHandler: ErrorHandler;

  constructor(logger: Logger, errorHandler: ErrorHandler) {
    this.logger = logger;
    this.errorHandler = errorHandler;
  }

  /**
   * Clone repository with sparse checkout
   */
  public async cloneRepository(
    repositoryUrl: string,
    options: CloneOptions
  ): Promise<GitInfo> {
    try {
      this.logger.info(`Cloning repository: ${repositoryUrl}`);
      this.logger.debug(`Clone options: ${JSON.stringify(options)}`);

      // Ensure working directory exists
      if (!fs.existsSync(options.workingDirectory)) {
        fs.mkdirSync(options.workingDirectory, { recursive: true });
      }

      // Initialize git repository
      this.executeGitCommand('init', [], options.workingDirectory);
      
      // Add remote origin
      this.executeGitCommand('remote', ['add', 'origin', repositoryUrl], options.workingDirectory);

      // Configure sparse checkout if specified
      if (options.sparseCheckout && options.sparseCheckout.length > 0) {
        this.logger.debug('Configuring sparse checkout');
        this.executeGitCommand('config', ['core.sparseCheckout', 'true'], options.workingDirectory);
        
        const sparseCheckoutFile = path.join(options.workingDirectory, '.git', 'info', 'sparse-checkout');
        const sparseCheckoutDir = path.dirname(sparseCheckoutFile);
        
        if (!fs.existsSync(sparseCheckoutDir)) {
          fs.mkdirSync(sparseCheckoutDir, { recursive: true });
        }
        
        fs.writeFileSync(sparseCheckoutFile, options.sparseCheckout.join('\n'));
      }

      // Fetch specific branch
      const fetchArgs = ['fetch', 'origin', options.branch];
      if (options.depth) {
        fetchArgs.push('--depth', options.depth.toString());
      }
      this.executeGitCommand('fetch', fetchArgs.slice(1), options.workingDirectory);

      // Checkout the branch
      // Clean branch name by removing 'refs/heads/' prefix if present
      const cleanBranchName = options.branch.replace(/^refs\/heads\//, '');
      this.executeGitCommand('checkout', ['-b', 'local-branch', `origin/${cleanBranchName}`], options.workingDirectory);

      // Fetch additional refs (e.g., target branch) to ensure base commits are present for diffs
      if (options.additionalRefs && options.additionalRefs.length > 0) {
        for (const ref of options.additionalRefs) {
          try {
            this.executeGitCommand('fetch', ['origin', ref], options.workingDirectory);
          } catch (e) {
            // Non-fatal: continue; diffs may still work if commit is reachable via other refs
            this.logger.warn(`Failed to fetch additional ref ${ref}: ${(e as Error).message}`);
          }
        }
      }

      // Get commit ID
      const commitId = this.executeGitCommand('rev-parse', ['HEAD'], options.workingDirectory).trim();

      const gitInfo: GitInfo = {
        repositoryUrl,
        branch: options.branch,
        commitId,
        workingDirectory: options.workingDirectory
      };

      this.logger.info(`Successfully cloned repository to ${options.workingDirectory}`);
      this.logger.debug(`Commit ID: ${commitId}`);

      return gitInfo;
    } catch (error) {
      throw this.errorHandler.createUserError(
        `Failed to clone repository: ${(error as Error).message}`,
        {
          operation: 'cloneRepository',
          component: 'GitManager',
          metadata: { repositoryUrl, options }
        }
      );
    }
  }

  /**
   * Get file content at specific commit
   */
  public async getFileContent(
    workingDirectory: string,
    filePath: string,
    commitId?: string
  ): Promise<string> {
    try {
      this.logger.debug(`Getting content for file: ${filePath}`);
      
      const ref = commitId || 'HEAD';
      const content = this.executeGitCommand('show', [`${ref}:${filePath}`], workingDirectory);
      
      this.logger.debug(`Successfully retrieved content for ${filePath}`);
      return content;
    } catch (error) {
      throw this.errorHandler.createUserError(
        `Failed to get file content: ${(error as Error).message}`,
        {
          operation: 'getFileContent',
          component: 'GitManager',
          metadata: { workingDirectory, filePath, commitId }
        }
      );
    }
  }

  /**
   * Get diff between commits
   */
  public async getDiff(
    workingDirectory: string,
    fromCommit: string,
    toCommit: string,
    filePath?: string
  ): Promise<string> {
    try {
      this.logger.debug(`Getting diff from ${fromCommit} to ${toCommit}`);
      
      const args = ['diff', fromCommit, toCommit];
      if (filePath) {
        args.push('--', filePath);
      }
      
      const diff = this.executeGitCommand('diff', args.slice(1), workingDirectory);
      
      this.logger.debug(`Successfully retrieved diff`);
      return diff;
    } catch (error) {
      throw this.errorHandler.createUserError(
        `Failed to get diff: ${(error as Error).message}`,
        {
          operation: 'getDiff',
          component: 'GitManager',
          metadata: { workingDirectory, fromCommit, toCommit, filePath }
        }
      );
    }
  }

  /**
   * Get list of changed files between commits
   */
  public async getChangedFiles(
    workingDirectory: string,
    fromCommit: string,
    toCommit: string
  ): Promise<string[]> {
    try {
      this.logger.debug(`Getting changed files from ${fromCommit} to ${toCommit}`);
      
      const output = this.executeGitCommand(
        'diff',
        ['--name-only', fromCommit, toCommit],
        workingDirectory
      );
      
      const files = output.trim().split('\n').filter(file => file.length > 0);
      
      this.logger.debug(`Found ${files.length} changed files`);
      return files;
    } catch (error) {
      throw this.errorHandler.createUserError(
        `Failed to get changed files: ${(error as Error).message}`,
        {
          operation: 'getChangedFiles',
          component: 'GitManager',
          metadata: { workingDirectory, fromCommit, toCommit }
        }
      );
    }
  }

  /**
   * Check if git is available
   */
  public checkGitAvailability(): boolean {
    try {
      execSync('git --version', { stdio: 'ignore' });
      return true;
    } catch (error) {
      this.logger.error('Git is not available in PATH');
      return false;
    }
  }

  /**
   * Clean up working directory
   */
  public async cleanup(workingDirectory: string): Promise<void> {
    try {
      this.logger.debug(`Cleaning up working directory: ${workingDirectory}`);
      
      if (fs.existsSync(workingDirectory)) {
        // On Windows, we need to handle file permissions
        if (process.platform === 'win32') {
          this.executeGitCommand('clean', ['-fdx'], workingDirectory);
        }
        
        fs.rmSync(workingDirectory, { recursive: true, force: true });
        this.logger.debug('Working directory cleaned up successfully');
      }
    } catch (error) {
      this.logger.warn(`Failed to cleanup working directory: ${(error as Error).message}`);
      // Don't throw error for cleanup failures
    }
  }

  /**
   * Get repository information
   */
  public async getRepositoryInfo(workingDirectory: string): Promise<{
    remoteUrl: string;
    currentBranch: string;
    currentCommit: string;
  }> {
    try {
      const remoteUrl = this.executeGitCommand(
        'config',
        ['--get', 'remote.origin.url'],
        workingDirectory
      ).trim();
      
      const currentBranch = this.executeGitCommand(
        'rev-parse',
        ['--abbrev-ref', 'HEAD'],
        workingDirectory
      ).trim();
      
      const currentCommit = this.executeGitCommand(
        'rev-parse',
        ['HEAD'],
        workingDirectory
      ).trim();
      
      return {
        remoteUrl,
        currentBranch,
        currentCommit
      };
    } catch (error) {
      throw this.errorHandler.createUserError(
        `Failed to get repository info: ${(error as Error).message}`,
        {
          operation: 'getRepositoryInfo',
          component: 'GitManager',
          metadata: { workingDirectory }
        }
      );
    }
  }

  /**
   * Execute git command synchronously
   */
  private executeGitCommand(command: string, args: string[], cwd: string): string {
    try {
      const fullCommand = `git ${command} ${args.join(' ')}`;
      this.logger.debug(`Executing: ${fullCommand}`);
      
      const result = execSync(`git ${command} ${args.join(' ')}`, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      
      return result;
    } catch (error) {
      const execError = error as any;
      const errorMessage = execError.stderr || execError.message || 'Unknown git error';
      
      this.logger.error(`Git command failed: git ${command} ${args.join(' ')}`);
      this.logger.error(`Error: ${errorMessage}`);
      
      throw new Error(`Git command failed: ${errorMessage}`);
    }
  }



  /**
   * Filter files based on patterns
   */
  public filterFiles(
    files: string[],
    includePatterns?: string[],
    excludePatterns?: string[]
  ): string[] {
    let filteredFiles = [...files];
    
    // Apply include patterns
    if (includePatterns && includePatterns.length > 0) {
      filteredFiles = filteredFiles.filter(file => 
        includePatterns.some(pattern => this.matchesPattern(file, pattern))
      );
    }
    
    // Apply exclude patterns
    if (excludePatterns && excludePatterns.length > 0) {
      filteredFiles = filteredFiles.filter(file => 
        !excludePatterns.some(pattern => this.matchesPattern(file, pattern))
      );
    }
    
    return filteredFiles;
  }

  /**
   * Simple pattern matching (supports * wildcard)
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }
}
