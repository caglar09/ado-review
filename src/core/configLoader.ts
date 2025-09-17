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
  openai?: {
    defaultModel: string;
    availableModels?: string[];
    timeout?: number;
  };
  openrouter?: {
    defaultModel: string;
    availableModels?: string[];
    timeout?: number;
    baseUrl?: string;
  };
  llm?: {
    defaultProvider: 'gemini-api' | 'openai' | 'openrouter';
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
    rules?: string[];
    projectRules?: string | null;
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
  private userConfigPath: string;
  private workspaceConfigPath?: string;

  constructor(logger: Logger, errorHandler: ErrorHandler, workspaceDir?: string) {
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
  private mergeConfigs(defaultConfig: AppConfig, userConfig: Partial<AppConfig>): AppConfig {
    const merged = JSON.parse(JSON.stringify(defaultConfig)) as AppConfig;
    
    // Helper function to deep merge objects
    const deepMerge = (target: any, source: any): any => {
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
          } else {
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
  public async loadConfig(): Promise<AppConfig> {
    if (this.config) {
      return this.config;
    }

    try {
      // Load default configuration
      if (!fs.existsSync(this.configPath)) {
        throw new Error(`Default configuration file not found: ${this.configPath}`);
      }

      const defaultConfigContent = fs.readFileSync(this.configPath, 'utf-8');
      const defaultConfig = yaml.load(defaultConfigContent) as AppConfig;

      if (!defaultConfig) {
        throw new Error('Failed to parse default configuration file');
      }

      // Load user configuration if it exists
      // Priority: workspace .adorevrc.yaml > project root .adorevrc.yaml
      let userConfig: Partial<AppConfig> = {};
      let configSource = 'none';
      
      // First, try to load from workspace directory
      if (this.workspaceConfigPath && fs.existsSync(this.workspaceConfigPath)) {
        this.logger.debug('Found .adorevrc.yaml in workspace, loading configuration');
        try {
          const userConfigContent = fs.readFileSync(this.workspaceConfigPath, 'utf-8');
          userConfig = yaml.load(userConfigContent) as Partial<AppConfig>;
          
          if (!userConfig) {
            this.logger.warn('Workspace configuration file is empty or invalid, trying project root');
            userConfig = {};
          } else {
            this.logger.debug('Workspace configuration loaded successfully');
            configSource = 'workspace';
          }
        } catch (userError) {
          this.logger.warn(`Failed to load workspace configuration: ${userError instanceof Error ? userError.message : 'Unknown error'}. Trying project root.`);
          userConfig = {};
        }
      }
      
      // If no workspace config found or failed to load, try project root
      if (configSource === 'none' && fs.existsSync(this.userConfigPath)) {
        this.logger.debug('Found .adorevrc.yaml in project root, loading configuration');
        try {
          const userConfigContent = fs.readFileSync(this.userConfigPath, 'utf-8');
          userConfig = yaml.load(userConfigContent) as Partial<AppConfig>;
          
          if (!userConfig) {
            this.logger.warn('Project root configuration file is empty or invalid, using defaults only');
            userConfig = {};
          } else {
            this.logger.debug('Project root configuration loaded successfully');
            configSource = 'project-root';
          }
        } catch (userError) {
          this.logger.warn(`Failed to load project root configuration: ${userError instanceof Error ? userError.message : 'Unknown error'}. Using defaults only.`);
          userConfig = {};
        }
      }
      
      if (configSource === 'none') {
        this.logger.debug('No .adorevrc.yaml found in workspace or project root, using default configuration only');
      } else {
        this.logger.info(`Using configuration from: ${configSource}`);
      }

      // Deep merge user config with default config
      this.config = this.mergeConfigs(defaultConfig, userConfig);
      
      // Override logging level from environment variable if set
      const envLogLevel = process.env['ADO_REVIEW_LOG_LEVEL'];
      if (envLogLevel && this.config?.logging?.levels?.includes(envLogLevel)) {
        this.config.logging.level = envLogLevel;
        this.logger.debug(`Log level overridden by ADO_REVIEW_LOG_LEVEL: ${envLogLevel}`);
      } else if (envLogLevel && this.config?.logging?.levels) {
        this.logger.warn(`Invalid ADO_REVIEW_LOG_LEVEL value: ${envLogLevel}. Valid values: ${this.config.logging.levels.join(', ')}`);
      }
      
      this.logger.debug('Configuration loaded and merged successfully');
      this.logger.debug(`Gemini timeout: ${this.config?.gemini?.timeout}ms`);
      this.logger.debug(`Current log level: ${this.config?.logging?.level}`);
      
      if (!this.config) {
        throw new Error('Configuration merge failed');
      }
      
      return this.config;
    } catch (error) {
      throw this.errorHandler.createInternalError(
        'Failed to load configuration',
        { 
          operation: 'loadConfig',
          component: 'ConfigLoader',
          metadata: { 
            defaultConfigPath: this.configPath,
            userConfigPath: this.userConfigPath
          }
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
