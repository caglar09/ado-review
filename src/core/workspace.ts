import fs from 'fs';
import path from 'path';
import os from 'os';
import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';

export interface WorkspaceOptions {
  baseDir?: string;
  prefix: string;
  keepOnExit: boolean;
  maxSizeBytes: number;
  excludePatterns: string[];
  includePatterns: string[];
  cleanupOnError: boolean;
  createSubdirs: boolean;
}

export interface WorkspaceInfo {
  path: string;
  created: Date;
  sizeBytes: number;
  fileCount: number;
  subdirectories: string[];
}

export interface CleanupResult {
  success: boolean;
  deletedFiles: number;
  deletedDirs: number;
  errors: string[];
  freedBytes: number;
}

export interface FileStats {
  path: string;
  size: number;
  isDirectory: boolean;
  modified: Date;
  relativePath: string;
}

export class Workspace {
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private workspacePath: string | null = null;
  private options: WorkspaceOptions;
  private createdFiles: Set<string> = new Set();
  private createdDirs: Set<string> = new Set();
  private cleanupHandlers: Array<() => Promise<void>> = [];

  constructor(logger: Logger, errorHandler: ErrorHandler, options: Partial<WorkspaceOptions> = {}) {
    this.logger = logger;
    this.errorHandler = errorHandler;
    this.options = {
      baseDir: os.tmpdir(),
      prefix: 'ado-review',
      keepOnExit: false,
      maxSizeBytes: 1024 * 1024 * 1024, // 1GB
      excludePatterns: [
        'node_modules/**',
        '.git/**',
        '*.lock',
        'Pods/**',
        '.DS_Store',
        'Thumbs.db',
        '*.tmp',
        '*.temp',
        '.vscode/**',
        '.idea/**'
      ],
      includePatterns: ['**/*'],
      cleanupOnError: true,
      createSubdirs: true,
      ...options
    };

    // Register cleanup on process exit
    if (!this.options.keepOnExit) {
      this.registerCleanupHandlers();
    }
  }

  /**
   * Create workspace directory
   */
  public async create(): Promise<string> {
    try {
      if (this.workspacePath) {
        this.logger.warn('Workspace already exists, returning existing path');
        return this.workspacePath;
      }

      // Generate unique workspace path
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const workspaceName = `${this.options.prefix}-${timestamp}-${random}`;
      this.workspacePath = path.join(this.options.baseDir!, workspaceName);

      // Create workspace directory
      await this.ensureDirectory(this.workspacePath);
      this.createdDirs.add(this.workspacePath);

      // Create standard subdirectories if enabled
      if (this.options.createSubdirs) {
        const subdirs = ['source', 'temp', 'output', 'logs'];
        for (const subdir of subdirs) {
          const subdirPath = path.join(this.workspacePath, subdir);
          await this.ensureDirectory(subdirPath);
          this.createdDirs.add(subdirPath);
        }
      }

      this.logger.info(`Workspace created: ${this.workspacePath}`);
      return this.workspacePath;
    } catch (error) {
      throw this.errorHandler.createFromError(
        error as Error,
        'Failed to create workspace'
      );
    }
  }

  /**
   * Get workspace path
   */
  public getPath(): string | null {
    return this.workspacePath;
  }

  /**
   * Get subdirectory path
   */
  public getSubdirPath(subdir: string): string {
    if (!this.workspacePath) {
      throw this.errorHandler.createInternalError(
        'Workspace not created'
      );
    }

    return path.join(this.workspacePath, subdir);
  }

  /**
   * Ensure directory exists
   */
  public async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
      this.createdDirs.add(dirPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Write file to workspace
   */
  public async writeFile(relativePath: string, content: string | Buffer): Promise<string> {
    try {
      if (!this.workspacePath) {
        throw new Error('Workspace not created');
      }

      const filePath = path.join(this.workspacePath, relativePath);
      
      // Ensure parent directory exists
      const parentDir = path.dirname(filePath);
      await this.ensureDirectory(parentDir);

      // Check file size limits
      const contentSize = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, 'utf8');
      await this.checkSizeLimit(contentSize);

      // Write file
      await fs.promises.writeFile(filePath, content);
      this.createdFiles.add(filePath);

      this.logger.debug(`File written: ${relativePath} (${contentSize} bytes)`);
      return filePath;
    } catch (error) {
      throw this.errorHandler.createFromError(
        error as Error,
        `Failed to write file: ${relativePath}`
      );
    }
  }

  /**
   * Read file from workspace
   */
  public async readFile(relativePath: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
    try {
      if (!this.workspacePath) {
        throw new Error('Workspace not created');
      }

      const filePath = path.join(this.workspacePath, relativePath);
      const content = await fs.promises.readFile(filePath, encoding);
      
      this.logger.debug(`File read: ${relativePath}`);
      return content;
    } catch (error) {
      throw this.errorHandler.createFromError(
        error as Error,
        `Failed to read file: ${relativePath}`
      );
    }
  }

  /**
   * Check if file exists in workspace
   */
  public async fileExists(relativePath: string): Promise<boolean> {
    try {
      if (!this.workspacePath) {
        return false;
      }

      const filePath = path.join(this.workspacePath, relativePath);
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List files in workspace
   */
  public async listFiles(subdir: string = '', pattern?: string): Promise<FileStats[]> {
    try {
      if (!this.workspacePath) {
        return [];
      }

      const searchPath = path.join(this.workspacePath, subdir);
      
      if (!await this.directoryExists(searchPath)) {
        return [];
      }

      const files = await this.scanDirectory(searchPath, pattern);
      
      return files.map(file => ({
        path: file.path,
        size: file.stats.size,
        isDirectory: file.stats.isDirectory(),
        modified: file.stats.mtime,
        relativePath: path.relative(this.workspacePath!, file.path)
      }));
    } catch (error) {
      throw this.errorHandler.createFromError(
        error as Error,
        `Failed to list files in directory: ${subdir}`
      );
    }
  }

  /**
   * Get workspace information
   */
  public async getInfo(): Promise<WorkspaceInfo | null> {
    try {
      if (!this.workspacePath || !await this.directoryExists(this.workspacePath)) {
        return null;
      }

      const files = await this.listFiles();
      const totalSize = files.reduce((sum, file) => sum + (file.isDirectory ? 0 : file.size), 0);
      const fileCount = files.filter(file => !file.isDirectory).length;
      const subdirectories = files
        .filter(file => file.isDirectory && !file.relativePath.includes(path.sep))
        .map(file => file.relativePath);

      const stats = await fs.promises.stat(this.workspacePath);

      return {
        path: this.workspacePath,
        created: stats.birthtime,
        sizeBytes: totalSize,
        fileCount,
        subdirectories
      };
    } catch (error) {
      throw this.errorHandler.createFromError(
        error as Error,
        'Failed to get workspace info'
      );
    }
  }

  /**
   * Clean up workspace
   */
  public async cleanup(): Promise<CleanupResult> {
    const result: CleanupResult = {
      success: true,
      deletedFiles: 0,
      deletedDirs: 0,
      errors: [],
      freedBytes: 0
    };

    try {
      if (!this.workspacePath) {
        this.logger.debug('No workspace to clean up');
        return result;
      }

      this.logger.info(`Cleaning up workspace: ${this.workspacePath}`);

      // Get workspace info before cleanup
      const info = await this.getInfo();
      if (info) {
        result.freedBytes = info.sizeBytes;
      }

      // Run custom cleanup handlers first
      for (const handler of this.cleanupHandlers) {
        try {
          await handler();
        } catch (error) {
          this.logger.warn(`Cleanup handler failed: ${(error as Error).message}`);
        }
      }

      // Delete workspace directory recursively
      if (await this.directoryExists(this.workspacePath)) {
        const deleteResult = await this.deleteDirectory(this.workspacePath);
        result.deletedFiles += deleteResult.files;
        result.deletedDirs += deleteResult.dirs;
        result.errors.push(...deleteResult.errors);
      }

      // Clear tracking sets
      this.createdFiles.clear();
      this.createdDirs.clear();
      this.workspacePath = null;

      if (result.errors.length === 0) {
        this.logger.info(`Workspace cleanup completed: ${result.deletedFiles} files, ${result.deletedDirs} directories deleted`);
      } else {
        this.logger.warn(`Workspace cleanup completed with ${result.errors.length} errors`);
        result.success = false;
      }

      return result;
    } catch (error) {
      const errorMsg = `Workspace cleanup failed: ${(error as Error).message}`;
      this.logger.error(errorMsg);
      result.errors.push(errorMsg);
      result.success = false;
      return result;
    }
  }

  /**
   * Add cleanup handler
   */
  public addCleanupHandler(handler: () => Promise<void>): void {
    this.cleanupHandlers.push(handler);
  }

  /**
   * Check if workspace should be filtered
   */
  public shouldIncludeFile(filePath: string): boolean {
    const relativePath = this.workspacePath ? path.relative(this.workspacePath, filePath) : filePath;
    
    // Check exclude patterns first
    for (const pattern of this.options.excludePatterns) {
      if (this.matchesPattern(relativePath, pattern)) {
        return false;
      }
    }
    
    // Check include patterns
    for (const pattern of this.options.includePatterns) {
      if (this.matchesPattern(relativePath, pattern)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Copy file to workspace with filtering
   */
  public async copyFile(sourcePath: string, relativePath: string): Promise<string | null> {
    try {
      if (!this.shouldIncludeFile(sourcePath)) {
        this.logger.debug(`File filtered out: ${relativePath}`);
        return null;
      }

      const content = await fs.promises.readFile(sourcePath);
      return await this.writeFile(relativePath, content);
    } catch (error) {
      throw this.errorHandler.createFromError(
        error as Error,
        `Failed to copy file from ${sourcePath} to ${relativePath}`
      );
    }
  }

  /**
   * Get workspace size
   */
  public async getSize(): Promise<number> {
    const info = await this.getInfo();
    return info ? info.sizeBytes : 0;
  }

  /**
   * Check size limit
   */
  private async checkSizeLimit(additionalBytes: number): Promise<void> {
    const currentSize = await this.getSize();
    const newSize = currentSize + additionalBytes;
    
    if (newSize > this.options.maxSizeBytes) {
      throw this.errorHandler.createInternalError(
        `Workspace size limit exceeded: ${newSize} > ${this.options.maxSizeBytes}`
      );
    }
  }

  /**
   * Check if directory exists
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Scan directory recursively
   */
  private async scanDirectory(
    dirPath: string,
    pattern?: string
  ): Promise<Array<{ path: string; stats: fs.Stats }>> {
    const results: Array<{ path: string; stats: fs.Stats }> = [];
    
    try {
      const entries = await fs.promises.readdir(dirPath);
      
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        const stats = await fs.promises.stat(entryPath);
        
        if (pattern && !this.matchesPattern(entry, pattern)) {
          continue;
        }
        
        results.push({ path: entryPath, stats });
        
        if (stats.isDirectory()) {
          const subResults = await this.scanDirectory(entryPath, pattern);
          results.push(...subResults);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to scan directory ${dirPath}: ${(error as Error).message}`);
    }
    
    return results;
  }

  /**
   * Delete directory recursively
   */
  private async deleteDirectory(dirPath: string): Promise<{ files: number; dirs: number; errors: string[] }> {
    const result = { files: 0, dirs: 0, errors: [] as string[] };
    
    try {
      const entries = await fs.promises.readdir(dirPath);
      
      // Delete all entries first
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        
        try {
          const stats = await fs.promises.stat(entryPath);
          
          if (stats.isDirectory()) {
            const subResult = await this.deleteDirectory(entryPath);
            result.files += subResult.files;
            result.dirs += subResult.dirs;
            result.errors.push(...subResult.errors);
          } else {
            await fs.promises.unlink(entryPath);
            result.files++;
          }
        } catch (error) {
          result.errors.push(`Failed to delete ${entryPath}: ${(error as Error).message}`);
        }
      }
      
      // Delete the directory itself
      await fs.promises.rmdir(dirPath);
      result.dirs++;
    } catch (error) {
      result.errors.push(`Failed to delete directory ${dirPath}: ${(error as Error).message}`);
    }
    
    return result;
  }

  /**
   * Match file pattern (simple glob-like matching)
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')  // ** matches any path
      .replace(/\*/g, '[^/]*') // * matches any filename
      .replace(/\?/g, '.')     // ? matches single character
      .replace(/\./g, '\\.')   // Escape dots
      .replace(/\//g, '[\\/]'); // Handle path separators
    
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(filePath.replace(/\\/g, '/'));
  }

  /**
   * Register cleanup handlers for process exit
   */
  private registerCleanupHandlers(): void {
    const cleanup = async () => {
      if (this.workspacePath && !this.options.keepOnExit) {
        try {
          await this.cleanup();
        } catch (error) {
          console.error('Failed to cleanup workspace on exit:', (error as Error).message);
        }
      }
    };

    // Handle different exit scenarios
    process.on('exit', () => {
      // Synchronous cleanup only
      if (this.workspacePath && !this.options.keepOnExit) {
        try {
          if (fs.existsSync(this.workspacePath)) {
            fs.rmSync(this.workspacePath, { recursive: true, force: true });
          }
        } catch (error) {
          console.error('Failed to cleanup workspace on exit:', (error as Error).message);
        }
      }
    });

    process.on('SIGINT', async () => {
      await cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await cleanup();
      process.exit(0);
    });

    process.on('uncaughtException', async (error) => {
      console.error('Uncaught exception:', error);
      if (this.options.cleanupOnError) {
        await cleanup();
      }
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
      console.error('Unhandled rejection:', reason);
      if (this.options.cleanupOnError) {
        await cleanup();
      }
      process.exit(1);
    });
  }

  /**
   * Get workspace summary
   */
  public getSummary(): string {
    return `Workspace manager for temporary file operations`;
  }
}