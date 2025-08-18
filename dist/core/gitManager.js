"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitManager = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class GitManager {
    logger;
    errorHandler;
    constructor(logger, errorHandler) {
        this.logger = logger;
        this.errorHandler = errorHandler;
    }
    /**
     * Clone repository with sparse checkout
     */
    async cloneRepository(repositoryUrl, options) {
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
            // Get commit ID
            const commitId = this.executeGitCommand('rev-parse', ['HEAD'], options.workingDirectory).trim();
            const gitInfo = {
                repositoryUrl,
                branch: options.branch,
                commitId,
                workingDirectory: options.workingDirectory
            };
            this.logger.info(`Successfully cloned repository to ${options.workingDirectory}`);
            this.logger.debug(`Commit ID: ${commitId}`);
            return gitInfo;
        }
        catch (error) {
            throw this.errorHandler.createUserError(`Failed to clone repository: ${error.message}`, {
                operation: 'cloneRepository',
                component: 'GitManager',
                metadata: { repositoryUrl, options }
            });
        }
    }
    /**
     * Get file content at specific commit
     */
    async getFileContent(workingDirectory, filePath, commitId) {
        try {
            this.logger.debug(`Getting content for file: ${filePath}`);
            const ref = commitId || 'HEAD';
            const content = this.executeGitCommand('show', [`${ref}:${filePath}`], workingDirectory);
            this.logger.debug(`Successfully retrieved content for ${filePath}`);
            return content;
        }
        catch (error) {
            throw this.errorHandler.createUserError(`Failed to get file content: ${error.message}`, {
                operation: 'getFileContent',
                component: 'GitManager',
                metadata: { workingDirectory, filePath, commitId }
            });
        }
    }
    /**
     * Get diff between commits
     */
    async getDiff(workingDirectory, fromCommit, toCommit, filePath) {
        try {
            this.logger.debug(`Getting diff from ${fromCommit} to ${toCommit}`);
            const args = ['diff', fromCommit, toCommit];
            if (filePath) {
                args.push('--', filePath);
            }
            const diff = this.executeGitCommand('diff', args.slice(1), workingDirectory);
            this.logger.debug(`Successfully retrieved diff`);
            return diff;
        }
        catch (error) {
            throw this.errorHandler.createUserError(`Failed to get diff: ${error.message}`, {
                operation: 'getDiff',
                component: 'GitManager',
                metadata: { workingDirectory, fromCommit, toCommit, filePath }
            });
        }
    }
    /**
     * Get list of changed files between commits
     */
    async getChangedFiles(workingDirectory, fromCommit, toCommit) {
        try {
            this.logger.debug(`Getting changed files from ${fromCommit} to ${toCommit}`);
            const output = this.executeGitCommand('diff', ['--name-only', fromCommit, toCommit], workingDirectory);
            const files = output.trim().split('\n').filter(file => file.length > 0);
            this.logger.debug(`Found ${files.length} changed files`);
            return files;
        }
        catch (error) {
            throw this.errorHandler.createUserError(`Failed to get changed files: ${error.message}`, {
                operation: 'getChangedFiles',
                component: 'GitManager',
                metadata: { workingDirectory, fromCommit, toCommit }
            });
        }
    }
    /**
     * Check if git is available
     */
    checkGitAvailability() {
        try {
            (0, child_process_1.execSync)('git --version', { stdio: 'ignore' });
            return true;
        }
        catch (error) {
            this.logger.error('Git is not available in PATH');
            return false;
        }
    }
    /**
     * Clean up working directory
     */
    async cleanup(workingDirectory) {
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
        }
        catch (error) {
            this.logger.warn(`Failed to cleanup working directory: ${error.message}`);
            // Don't throw error for cleanup failures
        }
    }
    /**
     * Get repository information
     */
    async getRepositoryInfo(workingDirectory) {
        try {
            const remoteUrl = this.executeGitCommand('config', ['--get', 'remote.origin.url'], workingDirectory).trim();
            const currentBranch = this.executeGitCommand('rev-parse', ['--abbrev-ref', 'HEAD'], workingDirectory).trim();
            const currentCommit = this.executeGitCommand('rev-parse', ['HEAD'], workingDirectory).trim();
            return {
                remoteUrl,
                currentBranch,
                currentCommit
            };
        }
        catch (error) {
            throw this.errorHandler.createUserError(`Failed to get repository info: ${error.message}`, {
                operation: 'getRepositoryInfo',
                component: 'GitManager',
                metadata: { workingDirectory }
            });
        }
    }
    /**
     * Execute git command synchronously
     */
    executeGitCommand(command, args, cwd) {
        try {
            const fullCommand = `git ${command} ${args.join(' ')}`;
            this.logger.debug(`Executing: ${fullCommand}`);
            const result = (0, child_process_1.execSync)(`git ${command} ${args.join(' ')}`, {
                cwd,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            });
            return result;
        }
        catch (error) {
            const execError = error;
            const errorMessage = execError.stderr || execError.message || 'Unknown git error';
            this.logger.error(`Git command failed: git ${command} ${args.join(' ')}`);
            this.logger.error(`Error: ${errorMessage}`);
            throw new Error(`Git command failed: ${errorMessage}`);
        }
    }
    /**
     * Filter files based on patterns
     */
    filterFiles(files, includePatterns, excludePatterns) {
        let filteredFiles = [...files];
        // Apply include patterns
        if (includePatterns && includePatterns.length > 0) {
            filteredFiles = filteredFiles.filter(file => includePatterns.some(pattern => this.matchesPattern(file, pattern)));
        }
        // Apply exclude patterns
        if (excludePatterns && excludePatterns.length > 0) {
            filteredFiles = filteredFiles.filter(file => !excludePatterns.some(pattern => this.matchesPattern(file, pattern)));
        }
        return filteredFiles;
    }
    /**
     * Simple pattern matching (supports * wildcard)
     */
    matchesPattern(filePath, pattern) {
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(filePath);
    }
}
exports.GitManager = GitManager;
//# sourceMappingURL=gitManager.js.map