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
exports.ConfigLoader = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
class ConfigLoader {
    logger;
    errorHandler;
    config = null;
    configPath;
    userConfigPath;
    workspaceConfigPath;
    constructor(logger, errorHandler, workspaceDir) {
        this.logger = logger;
        this.errorHandler = errorHandler;
        // Find config file path relative to the module
        const moduleDir = path.dirname(path.dirname(__dirname));
        // Try dist/config first (for built package), then src/config (for development)
        const distConfigPath = path.join(moduleDir, 'dist', 'config', 'defaults.yaml');
        const srcConfigPath = path.join(moduleDir, 'src', 'config', 'defaults.yaml');
        this.configPath = fs.existsSync(distConfigPath) ? distConfigPath : srcConfigPath;
        // Look for user config file in workspace first, then in project root
        if (workspaceDir) {
            this.workspaceConfigPath = path.join(workspaceDir, '.adorevrc.yaml');
            this.logger.debug(`Workspace config path: ${this.workspaceConfigPath}`);
        }
        this.userConfigPath = path.join(process.cwd(), '.adorevrc.yaml');
        this.logger.debug(`Default config path: ${this.configPath}`);
        this.logger.debug(`User config path: ${this.userConfigPath}`);
    }
    /**
     * Deep merge user configuration with default configuration
     */
    mergeConfigs(defaultConfig, userConfig) {
        const merged = JSON.parse(JSON.stringify(defaultConfig));
        // Helper function to deep merge objects
        const deepMerge = (target, source) => {
            if (source === null || source === undefined) {
                return target;
            }
            if (typeof source !== 'object' || Array.isArray(source)) {
                return source;
            }
            for (const key in source) {
                if (source.hasOwnProperty(key)) {
                    if (target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
                        target[key] = deepMerge(target[key], source[key]);
                    }
                    else {
                        target[key] = source[key];
                    }
                }
            }
            return target;
        };
        return deepMerge(merged, userConfig);
    }
    /**
     * Load configuration from defaults.yaml and merge with .adorevrc.yaml if present
     */
    async loadConfig() {
        if (this.config) {
            return this.config;
        }
        try {
            // Load default configuration
            if (!fs.existsSync(this.configPath)) {
                throw new Error(`Default configuration file not found: ${this.configPath}`);
            }
            const defaultConfigContent = fs.readFileSync(this.configPath, 'utf-8');
            const defaultConfig = yaml.load(defaultConfigContent);
            if (!defaultConfig) {
                throw new Error('Failed to parse default configuration file');
            }
            // Load user configuration if it exists
            // Priority: workspace .adorevrc.yaml > project root .adorevrc.yaml
            let userConfig = {};
            let configSource = 'none';
            // First, try to load from workspace directory
            if (this.workspaceConfigPath && fs.existsSync(this.workspaceConfigPath)) {
                this.logger.debug('Found .adorevrc.yaml in workspace, loading configuration');
                try {
                    const userConfigContent = fs.readFileSync(this.workspaceConfigPath, 'utf-8');
                    userConfig = yaml.load(userConfigContent);
                    if (!userConfig) {
                        this.logger.warn('Workspace configuration file is empty or invalid, trying project root');
                        userConfig = {};
                    }
                    else {
                        this.logger.debug('Workspace configuration loaded successfully');
                        configSource = 'workspace';
                    }
                }
                catch (userError) {
                    this.logger.warn(`Failed to load workspace configuration: ${userError instanceof Error ? userError.message : 'Unknown error'}. Trying project root.`);
                    userConfig = {};
                }
            }
            // If no workspace config found or failed to load, try project root
            if (configSource === 'none' && fs.existsSync(this.userConfigPath)) {
                this.logger.debug('Found .adorevrc.yaml in project root, loading configuration');
                try {
                    const userConfigContent = fs.readFileSync(this.userConfigPath, 'utf-8');
                    userConfig = yaml.load(userConfigContent);
                    if (!userConfig) {
                        this.logger.warn('Project root configuration file is empty or invalid, using defaults only');
                        userConfig = {};
                    }
                    else {
                        this.logger.debug('Project root configuration loaded successfully');
                        configSource = 'project-root';
                    }
                }
                catch (userError) {
                    this.logger.warn(`Failed to load project root configuration: ${userError instanceof Error ? userError.message : 'Unknown error'}. Using defaults only.`);
                    userConfig = {};
                }
            }
            if (configSource === 'none') {
                this.logger.debug('No .adorevrc.yaml found in workspace or project root, using default configuration only');
            }
            else {
                this.logger.info(`Using configuration from: ${configSource}`);
            }
            // Deep merge user config with default config
            this.config = this.mergeConfigs(defaultConfig, userConfig);
            // Override logging level from environment variable if set
            const envLogLevel = process.env['ADO_REVIEW_LOG_LEVEL'];
            if (envLogLevel && this.config?.logging?.levels?.includes(envLogLevel)) {
                this.config.logging.level = envLogLevel;
                this.logger.debug(`Log level overridden by ADO_REVIEW_LOG_LEVEL: ${envLogLevel}`);
            }
            else if (envLogLevel && this.config?.logging?.levels) {
                this.logger.warn(`Invalid ADO_REVIEW_LOG_LEVEL value: ${envLogLevel}. Valid values: ${this.config.logging.levels.join(', ')}`);
            }
            this.logger.debug('Configuration loaded and merged successfully');
            this.logger.debug(`Gemini timeout: ${this.config?.gemini?.timeout}ms`);
            this.logger.debug(`Current log level: ${this.config?.logging?.level}`);
            if (!this.config) {
                throw new Error('Configuration merge failed');
            }
            return this.config;
        }
        catch (error) {
            throw this.errorHandler.createInternalError('Failed to load configuration', {
                operation: 'loadConfig',
                component: 'ConfigLoader',
                metadata: {
                    defaultConfigPath: this.configPath,
                    userConfigPath: this.userConfigPath
                }
            }, error instanceof Error ? error : undefined);
        }
    }
    /**
     * Get configuration (load if not already loaded)
     */
    async getConfig() {
        if (!this.config) {
            await this.loadConfig();
        }
        return this.config;
    }
    /**
     * Get Gemini configuration
     */
    async getGeminiConfig() {
        const config = await this.getConfig();
        return config.gemini;
    }
    /**
     * Get Azure DevOps configuration
     */
    async getAzureDevOpsConfig() {
        const config = await this.getConfig();
        return config.azo;
    }
    /**
     * Get Git configuration
     */
    async getGitConfig() {
        const config = await this.getConfig();
        return config.git;
    }
    /**
     * Get Rate Limit configuration
     */
    async getRateLimitConfig() {
        const config = await this.getConfig();
        return config.rateLimit;
    }
    /**
     * Get Review configuration
     */
    async getReviewConfig() {
        const config = await this.getConfig();
        return config.review;
    }
    /**
     * Get Files configuration
     */
    async getFilesConfig() {
        const config = await this.getConfig();
        return config.files;
    }
    /**
     * Get Workspace configuration
     */
    async getWorkspaceConfig() {
        const config = await this.getConfig();
        return config.workspace;
    }
    /**
     * Get Logging configuration
     */
    async getLoggingConfig() {
        const config = await this.getConfig();
        return config.logging;
    }
    /**
     * Get Comments configuration
     */
    async getCommentsConfig() {
        const config = await this.getConfig();
        return config.comments;
    }
    /**
     * Get Status configuration
     */
    async getStatusConfig() {
        const config = await this.getConfig();
        return config.status;
    }
    /**
     * Get Errors configuration
     */
    async getErrorsConfig() {
        const config = await this.getConfig();
        return config.errors;
    }
}
exports.ConfigLoader = ConfigLoader;
//# sourceMappingURL=configLoader.js.map