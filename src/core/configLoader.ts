import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';

export interface AppConfig {
  azo: {
    timeout: number;
    maxRetries: number;
    retryDelay: number;
    apiVersion: string;
  };
  git: {
    depth: number;
    timeout: number;
    excludePatterns: string[];
  };
  gemini: {
    defaultModel: string;
    availableModels: string[];
    maxContextTokens: number;
    temperature: number;
    topP: number;
    topK: number;
    timeout: number;
  };
  rateLimit: {
    batchSize: number;
    sleepMs: number;
    maxConcurrent: number;
    backoffMultiplier: number;
    maxBackoffMs: number;
  };
  review: {
    severityThreshold: string;
    severityLevels: string[];
    format: string;
    formats: string[];
    maxTableFindings: number;
    maxDiffLineLength: number;
    contextLines: number;
  };
  files: {
    defaultInclude: string[];
    defaultExclude: string[];
    maxFileSize: number;
    maxTotalFiles: number;
  };
  workspace: {
    tmpPrefix: string;
    cleanupTimeout: number;
    maxSize: number;
  };
  logging: {
    level: string;
    levels: string[];
    file: {
      enabled: boolean;
      path: string;
      maxSize: number;
      maxFiles: number;
    };
    console: {
      enabled: boolean;
      colors: boolean;
      timestamps: boolean;
    };
    maskSecrets: string[];
  };
  comments: {
    maxCommentsPerPR: number;
    maxCommentLength: number;
    idempotent: boolean;
    template: string;
  };
  status: {
    context: string;
    descriptions: {
      pending: string;
      success: string;
      failed: string;
      error: string;
    };
    targetUrl: string | null;
  };
  errors: {
    exitCodes: {
      success: number;
      hasFindings: number;
      userError: number;
      apiError: number;
      internalError: number;
    };
    retry: {
      maxRetries: number;
      initialDelay: number;
      maxDelay: number;
      backoffMultiplier: number;
    };
    timeouts: {
      default: number;
      git: number;
      llm: number;
      api: number;
    };
  };
}

export class ConfigLoader {
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private config: AppConfig | null = null;
  private configPath: string;

  constructor(logger: Logger, errorHandler: ErrorHandler) {
    this.logger = logger;
    this.errorHandler = errorHandler;
    
    // Find config file path relative to the module
    const moduleDir = path.dirname(path.dirname(__dirname));
    
    // Try dist/config first (for built package), then src/config (for development)
    const distConfigPath = path.join(moduleDir, 'dist', 'config', 'defaults.yaml');
    const srcConfigPath = path.join(moduleDir, 'src', 'config', 'defaults.yaml');
    
    this.configPath = fs.existsSync(distConfigPath) ? distConfigPath : srcConfigPath;
    
    this.logger.debug(`Config path: ${this.configPath}`);
  }

  /**
   * Load configuration from defaults.yaml
   */
  public async loadConfig(): Promise<AppConfig> {
    if (this.config) {
      return this.config;
    }

    try {
      if (!fs.existsSync(this.configPath)) {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }

      const configContent = fs.readFileSync(this.configPath, 'utf-8');
      const parsedConfig = yaml.load(configContent) as AppConfig;

      if (!parsedConfig) {
        throw new Error('Failed to parse configuration file');
      }

      this.config = parsedConfig;
      
      // Override logging level from environment variable if set
      const envLogLevel = process.env['ADO_REVIEW_LOG_LEVEL'];
      if (envLogLevel && this.config.logging.levels.includes(envLogLevel)) {
        this.config.logging.level = envLogLevel;
        this.logger.debug(`Log level overridden by ADO_REVIEW_LOG_LEVEL: ${envLogLevel}`);
      } else if (envLogLevel) {
        this.logger.warn(`Invalid ADO_REVIEW_LOG_LEVEL value: ${envLogLevel}. Valid values: ${this.config.logging.levels.join(', ')}`);
      }
      
      this.logger.debug('Configuration loaded successfully');
      this.logger.debug(`Gemini timeout: ${this.config.gemini.timeout}ms`);
      this.logger.debug(`Current log level: ${this.config.logging.level}`);
      
      return this.config;
    } catch (error) {
      throw this.errorHandler.createInternalError(
        'Failed to load configuration',
        { 
          operation: 'loadConfig',
          component: 'ConfigLoader',
          metadata: { configPath: this.configPath }
        },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get configuration (load if not already loaded)
   */
  public async getConfig(): Promise<AppConfig> {
    if (!this.config) {
      await this.loadConfig();
    }
    return this.config!;
  }

  /**
   * Get Gemini configuration
   */
  public async getGeminiConfig(): Promise<AppConfig['gemini']> {
    const config = await this.getConfig();
    return config.gemini;
  }

  /**
   * Get Azure DevOps configuration
   */
  public async getAzureDevOpsConfig(): Promise<AppConfig['azo']> {
    const config = await this.getConfig();
    return config.azo;
  }

  /**
   * Get Git configuration
   */
  public async getGitConfig(): Promise<AppConfig['git']> {
    const config = await this.getConfig();
    return config.git;
  }

  /**
   * Get Rate Limit configuration
   */
  public async getRateLimitConfig(): Promise<AppConfig['rateLimit']> {
    const config = await this.getConfig();
    return config.rateLimit;
  }

  /**
   * Get Review configuration
   */
  public async getReviewConfig(): Promise<AppConfig['review']> {
    const config = await this.getConfig();
    return config.review;
  }

  /**
   * Get Files configuration
   */
  public async getFilesConfig(): Promise<AppConfig['files']> {
    const config = await this.getConfig();
    return config.files;
  }

  /**
   * Get Workspace configuration
   */
  public async getWorkspaceConfig(): Promise<AppConfig['workspace']> {
    const config = await this.getConfig();
    return config.workspace;
  }

  /**
   * Get Logging configuration
   */
  public async getLoggingConfig(): Promise<AppConfig['logging']> {
    const config = await this.getConfig();
    return config.logging;
  }

  /**
   * Get Comments configuration
   */
  public async getCommentsConfig(): Promise<AppConfig['comments']> {
    const config = await this.getConfig();
    return config.comments;
  }

  /**
   * Get Status configuration
   */
  public async getStatusConfig(): Promise<AppConfig['status']> {
    const config = await this.getConfig();
    return config.status;
  }

  /**
   * Get Errors configuration
   */
  public async getErrorsConfig(): Promise<AppConfig['errors']> {
    const config = await this.getConfig();
    return config.errors;
  }
}