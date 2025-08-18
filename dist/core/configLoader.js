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
    constructor(logger, errorHandler) {
        this.config = null;
        this.logger = logger;
        this.errorHandler = errorHandler;
        // Find config file path relative to the module
        const moduleDir = path.dirname(path.dirname(__dirname));
        this.configPath = path.join(moduleDir, 'src', 'config', 'defaults.yaml');
        this.logger.debug(`Config path: ${this.configPath}`);
    }
    /**
     * Load configuration from defaults.yaml
     */
    async loadConfig() {
        if (this.config) {
            return this.config;
        }
        try {
            if (!fs.existsSync(this.configPath)) {
                throw new Error(`Configuration file not found: ${this.configPath}`);
            }
            const configContent = fs.readFileSync(this.configPath, 'utf-8');
            const parsedConfig = yaml.load(configContent);
            if (!parsedConfig) {
                throw new Error('Failed to parse configuration file');
            }
            this.config = parsedConfig;
            // Override logging level from environment variable if set
            const envLogLevel = process.env['ADO_REVIEW_LOG_LEVEL'];
            if (envLogLevel && this.config.logging.levels.includes(envLogLevel)) {
                this.config.logging.level = envLogLevel;
                this.logger.debug(`Log level overridden by ADO_REVIEW_LOG_LEVEL: ${envLogLevel}`);
            }
            else if (envLogLevel) {
                this.logger.warn(`Invalid ADO_REVIEW_LOG_LEVEL value: ${envLogLevel}. Valid values: ${this.config.logging.levels.join(', ')}`);
            }
            this.logger.debug('Configuration loaded successfully');
            this.logger.debug(`Gemini timeout: ${this.config.gemini.timeout}ms`);
            this.logger.debug(`Current log level: ${this.config.logging.level}`);
            return this.config;
        }
        catch (error) {
            throw this.errorHandler.createInternalError('Failed to load configuration', {
                operation: 'loadConfig',
                component: 'ConfigLoader',
                metadata: { configPath: this.configPath }
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