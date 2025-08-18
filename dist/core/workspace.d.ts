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
export declare class Workspace {
    private logger;
    private errorHandler;
    private workspacePath;
    private options;
    private createdFiles;
    private createdDirs;
    private cleanupHandlers;
    constructor(logger: Logger, errorHandler: ErrorHandler, options?: Partial<WorkspaceOptions>);
    /**
     * Create workspace directory
     */
    create(): Promise<string>;
    /**
     * Get workspace path
     */
    getPath(): string | null;
    /**
     * Get subdirectory path
     */
    getSubdirPath(subdir: string): string;
    /**
     * Ensure directory exists
     */
    ensureDirectory(dirPath: string): Promise<void>;
    /**
     * Write file to workspace
     */
    writeFile(relativePath: string, content: string | Buffer): Promise<string>;
    /**
     * Read file from workspace
     */
    readFile(relativePath: string, encoding?: BufferEncoding): Promise<string>;
    /**
     * Check if file exists in workspace
     */
    fileExists(relativePath: string): Promise<boolean>;
    /**
     * List files in workspace
     */
    listFiles(subdir?: string, pattern?: string): Promise<FileStats[]>;
    /**
     * Get workspace information
     */
    getInfo(): Promise<WorkspaceInfo | null>;
    /**
     * Clean up workspace
     */
    cleanup(): Promise<CleanupResult>;
    /**
     * Add cleanup handler
     */
    addCleanupHandler(handler: () => Promise<void>): void;
    /**
     * Check if workspace should be filtered
     */
    shouldIncludeFile(filePath: string): boolean;
    /**
     * Copy file to workspace with filtering
     */
    copyFile(sourcePath: string, relativePath: string): Promise<string | null>;
    /**
     * Get workspace size
     */
    getSize(): Promise<number>;
    /**
     * Check size limit
     */
    private checkSizeLimit;
    /**
     * Check if directory exists
     */
    private directoryExists;
    /**
     * Scan directory recursively
     */
    private scanDirectory;
    /**
     * Delete directory recursively
     */
    private deleteDirectory;
    /**
     * Match file pattern (simple glob-like matching)
     */
    private matchesPattern;
    /**
     * Register cleanup handlers for process exit
     */
    private registerCleanupHandlers;
    /**
     * Get workspace summary
     */
    getSummary(): string;
}
//# sourceMappingURL=workspace.d.ts.map