import { glob } from 'glob';
import path from 'path';
import fs from 'fs';
import * as yaml from 'js-yaml';
import { Logger } from '../core/logger.js';

export interface ReviewOptions {
  // PR identification
  prUrl?: string;
  pr?: string;
  org?: string;
  project?: string;
  repo?: string;
  
  // Rules and configuration
  rules: string[];
  projectRules?: string;
  customPromptTemplate?: string;
  
  // File filtering
  include: string[];
  exclude: string[];
  files: string[];
  allFiles: boolean;
  
  // LLM configuration
  model: string;
  maxContextTokens: number;
  
  // Rate limiting
  ratelimitBatch: number;
  ratelimitSleepMs: number;
  
  // Workspace
  tmpDir?: string;
  keepWorkdir: boolean;
  
  // Output and behavior
  postStatus: boolean;
  autoApprove: boolean;
  dryRun: boolean;
  format: 'table' | 'json';
  severityThreshold: 'info' | 'warning' | 'error';
  verbose: boolean;
}

export interface ParsedPRInfo {
  type: 'url' | 'id';
  url?: string;
  id?: string;
  org?: string;
  project?: string;
  repo?: string;
}

export class ArgsParser {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Parse and validate CLI options
   */
  public async parseOptions(options: any): Promise<ReviewOptions> {
    const parsed: ReviewOptions = {
      // PR identification
      prUrl: options.prUrl,
      pr: options.pr,
      org: options.org,
      project: options.project,
      repo: options.repo,
      
      // Rules and configuration
      rules: await this.expandRulesPaths(options.rules || []),
      projectRules: options.projectRules,
      customPromptTemplate: options.customPromptTemplate,
      
      // File filtering
      include: options.include || [],
      exclude: options.exclude || [],
      files: options.files || [],
      allFiles: options.allFiles || false,
      
      // LLM configuration
      model: options.model || this.getDefaultModelFromConfig(),
      maxContextTokens: options.maxContextTokens || 32000,
      
      // Rate limiting
      ratelimitBatch: options.ratelimitBatch || 5,
      ratelimitSleepMs: options.ratelimitSleepMs || 1000,
      
      // Workspace
      tmpDir: options.tmpDir,
      keepWorkdir: options.keepWorkdir || false,
      
      // Output and behavior
      postStatus: options.postStatus || false,
      autoApprove: options.autoApprove || false,
      dryRun: options.dryRun || false,
      format: options.format || 'table',
      severityThreshold: options.severityThreshold || 'info',
      verbose: options.verbose || false
    };

    await this.validateOptions(parsed);
    return parsed;
  }

  /**
   * Parse PR information from options
   */
  public parsePRInfo(options: ReviewOptions): ParsedPRInfo {
    if (options.prUrl) {
      return {
        type: 'url',
        url: options.prUrl
      };
    }

    if (options.pr && options.org && options.project && options.repo) {
      return {
        type: 'id',
        id: options.pr,
        org: options.org,
        project: options.project,
        repo: options.repo
      };
    }

    throw new Error('Invalid PR information provided');
  }

  /**
   * Expand glob patterns in rules paths
   */
  private async expandRulesPaths(rulesPaths: string[]): Promise<string[]> {
    const expandedPaths: string[] = [];

    for (const rulePath of rulesPaths) {
      try {
        // Check if it's a glob pattern
        if (rulePath.includes('*') || rulePath.includes('?') || rulePath.includes('[')) {
          const matches = await glob(rulePath, { 
            absolute: true,
            ignore: ['**/node_modules/**', '**/.*/**']
          });
          expandedPaths.push(...matches);
        } else {
          // Direct path
          const absolutePath = path.resolve(rulePath);
          if (fs.existsSync(absolutePath)) {
            expandedPaths.push(absolutePath);
          } else {
            this.logger.warn(`Rules file not found: ${absolutePath}`);
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to expand rules path '${rulePath}': ${error}`);
      }
    }

    return [...new Set(expandedPaths)]; // Remove duplicates
  }

  /**
   * Validate parsed options
   */
  private async validateOptions(options: ReviewOptions): Promise<void> {
    // Validate PR information
    if (!options.prUrl && !options.pr) {
      throw new Error('Either --pr-url or --pr must be provided');
    }

    if (options.pr && (!options.org || !options.project || !options.repo)) {
      throw new Error('When using --pr, you must also provide --org, --project, and --repo');
    }

    // Validate PR URL format if provided
    if (options.prUrl && !this.isValidAzureDevOpsPRUrl(options.prUrl)) {
      throw new Error('Invalid Azure DevOps PR URL format');
    }

    // Validate rules files exist
    for (const rulePath of options.rules) {
      if (!fs.existsSync(rulePath)) {
        throw new Error(`Rules file not found: ${rulePath}`);
      }
      
      const ext = path.extname(rulePath).toLowerCase();
      if (!['.yaml', '.yml', '.json', '.md'].includes(ext)) {
        throw new Error(`Unsupported rules file format: ${rulePath}. Supported formats: .yaml, .yml, .json, .md`);
      }
    }

    // Validate project rules file if provided
    if (options.projectRules) {
      if (!fs.existsSync(options.projectRules)) {
        throw new Error(`Project rules file not found: ${options.projectRules}`);
      }
    }

    // Validate numeric options
    if (options.maxContextTokens <= 0) {
      throw new Error('max-context-tokens must be a positive number');
    }

    if (options.ratelimitBatch <= 0) {
      throw new Error('ratelimit-batch must be a positive number');
    }

    if (options.ratelimitSleepMs < 0) {
      throw new Error('ratelimit-sleep-ms must be non-negative');
    }

    // Validate temporary directory if provided
    if (options.tmpDir) {
      const tmpDirPath = path.resolve(options.tmpDir);
      if (!fs.existsSync(tmpDirPath)) {
        try {
          fs.mkdirSync(tmpDirPath, { recursive: true });
        } catch (error) {
          throw new Error(`Cannot create temporary directory: ${tmpDirPath}`);
        }
      }

      // Check if directory is writable
      try {
        const testFile = path.join(tmpDirPath, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
      } catch (error) {
        throw new Error(`Temporary directory is not writable: ${tmpDirPath}`);
      }
    }

    // Validate file filtering options
    if (options.files.length > 0 && options.allFiles) {
      throw new Error('Cannot use both --files and --all-files options together');
    }

    // Validate Gemini model name
    const validModels = this.getValidModelsFromConfig();
    if (!validModels.includes(options.model)) {
      this.logger.warn(`Unknown Gemini model: ${options.model}. Supported models: ${validModels.join(', ')}`);
    }
  }

  /**
   * Validate Azure DevOps PR URL format
   */
  private isValidAzureDevOpsPRUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      
      // Check if it's an Azure DevOps domain
      const validDomains = ['dev.azure.com', 'visualstudio.com'];
      const isValidDomain = validDomains.some(domain => 
        urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
      );
      
      if (!isValidDomain) {
        return false;
      }

      // Check if URL contains pullrequest path
      return urlObj.pathname.includes('/pullrequest/') || urlObj.pathname.includes('/_git/');
    } catch {
      return false;
    }
  }

  /**
   * Extract PR ID from Azure DevOps URL
   */
  public extractPRIdFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      
      // Look for pullrequest segment followed by ID
      const prIndex = pathParts.findIndex(part => part === 'pullrequest');
      if (prIndex !== -1 && prIndex + 1 < pathParts.length) {
        const prId = pathParts[prIndex + 1];
        return prId || null;
      }
      
      // Alternative: check URL parameters
      const prId = urlObj.searchParams.get('_a') === 'overview' 
        ? urlObj.searchParams.get('pullRequestId')
        : null;
      
      return prId;
    } catch {
      return null;
    }
  }

  /**
   * Extract organization, project, and repo from Azure DevOps URL
   */
  public extractRepoInfoFromUrl(url: string): { org: string; project: string; repo: string } | null {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
      
      if (urlObj.hostname === 'dev.azure.com') {
        // Format: https://dev.azure.com/{org}/{project}/_git/{repo}
        if (pathParts.length >= 4 && pathParts[2] === '_git' && pathParts[0] && pathParts[1] && pathParts[3]) {
          return {
            org: pathParts[0],
            project: pathParts[1],
            repo: pathParts[3]
          };
        }
      } else if (urlObj.hostname.endsWith('.visualstudio.com')) {
        // Format: https://{org}.visualstudio.com/{project}/_git/{repo}
        const orgParts = urlObj.hostname.split('.');
        const org = orgParts[0];
        if (pathParts.length >= 3 && pathParts[1] === '_git' && org && pathParts[0] && pathParts[2]) {
          return {
            org,
            project: pathParts[0],
            repo: pathParts[2]
          };
        }
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get valid models from defaults.yaml configuration
   */
  private getValidModelsFromConfig(): string[] {
    try {
      const configPath = path.join(__dirname, '..', 'config', 'defaults.yaml');
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(configContent) as any;
      
      if (config?.gemini?.availableModels && Array.isArray(config.gemini.availableModels)) {
        return config.gemini.availableModels;
      }
      
      // Fallback to hardcoded list if config is not available
      this.logger.warn('Could not load available models from config, using fallback list');
      return ['gemini-pro', 'gemini-pro-vision', 'gemini-1.5-pro', 'gemini-1.5-flash'];
    } catch (error) {
      this.logger.warn(`Error loading config file: ${error}. Using fallback model list.`);
      return ['gemini-pro', 'gemini-pro-vision', 'gemini-1.5-pro', 'gemini-1.5-flash'];
    }
  }

  private getDefaultModelFromConfig(): string {
    try {
      const configPath = path.join(__dirname, '..', 'config', 'defaults.yaml');
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(configContent) as any;
      
      if (config?.gemini?.defaultModel && typeof config.gemini.defaultModel === 'string') {
        return config.gemini.defaultModel;
      }
      
      // Fallback to hardcoded default if config is not available
      this.logger.warn('Could not load default model from config, using fallback default');
      return 'gemini-pro';
    } catch (error) {
      this.logger.warn(`Error loading config file: ${error}. Using fallback default model.`);
      return 'gemini-pro';
    }
  }
}