import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { glob } from 'glob';
import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';

export interface ReviewRule {
  id: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  pattern?: string;
  fileTypes?: string[];
  suggestion?: string;
  enabled: boolean;
}

export interface RuleSet {
  name: string;
  version: string;
  description?: string;
  rules: ReviewRule[];
  metadata?: Record<string, any>;
}

export interface ProjectGuideline {
  title: string;
  content: string;
  source: string;
  type: 'markdown' | 'text';
}

export interface LoadedRules {
  ruleSets: RuleSet[];
  guidelines: ProjectGuideline[];
  totalRules: number;
  enabledRules: number;
}

export class RulesLoader {
  private logger: Logger;
  private errorHandler: ErrorHandler;

  constructor(logger: Logger, errorHandler: ErrorHandler) {
    this.logger = logger;
    this.errorHandler = errorHandler;
  }

  /**
   * Load rules from multiple sources
   */
  public async loadRules(
    rulesPaths: string[],
    projectRulesPath?: string
  ): Promise<LoadedRules> {
    try {
      this.logger.info('Loading review rules and guidelines');
      
      const ruleSets: RuleSet[] = [];
      const guidelines: ProjectGuideline[] = [];
      
      // Process each rules path
      for (const rulesPath of rulesPaths) {
        await this.processRulesPath(rulesPath, ruleSets, guidelines);
      }
      
      // Process project rules if specified
      if (projectRulesPath) {
        await this.processRulesPath(projectRulesPath, ruleSets, guidelines);
      }
      
      // Calculate totals
      const totalRules = ruleSets.reduce((sum, ruleSet) => sum + ruleSet.rules.length, 0);
      const enabledRules = ruleSets.reduce(
        (sum, ruleSet) => sum + ruleSet.rules.filter(rule => rule.enabled).length,
        0
      );
      
      this.logger.info(`Loaded ${ruleSets.length} rule sets, ${totalRules} total rules (${enabledRules} enabled), ${guidelines.length} guidelines`);
      
      return {
        ruleSets,
        guidelines,
        totalRules,
        enabledRules
      };
    } catch (error) {
      throw this.errorHandler.createFromError(
        error as Error,
        'Failed to load rules',
        {
          operation: 'loadRules',
          component: 'RulesLoader',
          metadata: { rulesPaths, projectRulesPath }
        }
      );
    }
  }

  /**
   * Process a single rules path (file or glob pattern)
   */
  private async processRulesPath(
    rulesPath: string,
    ruleSets: RuleSet[],
    guidelines: ProjectGuideline[]
  ): Promise<void> {
    this.logger.debug(`Processing rules path: ${rulesPath}`);
    
    // Check if it's a glob pattern
    if (rulesPath.includes('*') || rulesPath.includes('?')) {
      const files = await glob(rulesPath);
      this.logger.debug(`Glob pattern matched ${files.length} files`);
      
      for (const file of files) {
        await this.processFile(file, ruleSets, guidelines);
      }
    } else {
      // Single file or directory
      await this.processFile(rulesPath, ruleSets, guidelines);
    }
  }

  /**
   * Process a single file
   */
  private async processFile(
    filePath: string,
    ruleSets: RuleSet[],
    guidelines: ProjectGuideline[]
  ): Promise<void> {
    try {
      if (!fs.existsSync(filePath)) {
        this.logger.warn(`File not found: ${filePath}`);
        return;
      }
      
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        // Process directory
        await this.processDirectory(filePath, ruleSets, guidelines);
      } else {
        // Process single file
        await this.processSingleFile(filePath, ruleSets, guidelines);
      }
    } catch (error) {
      this.logger.warn(`Failed to process file ${filePath}: ${(error as Error).message}`);
      // Continue with other files
    }
  }

  /**
   * Process directory
   */
  private async processDirectory(
    dirPath: string,
    ruleSets: RuleSet[],
    guidelines: ProjectGuideline[]
  ): Promise<void> {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const stats = fs.statSync(fullPath);
      
      if (stats.isFile()) {
        await this.processSingleFile(fullPath, ruleSets, guidelines);
      }
    }
  }

  /**
   * Process single file
   */
  private async processSingleFile(
    filePath: string,
    ruleSets: RuleSet[],
    guidelines: ProjectGuideline[]
  ): Promise<void> {
    const extension = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf-8');
    
    this.logger.debug(`Processing file: ${filePath}`);
    
    switch (extension) {
      case '.yaml':
      case '.yml':
        await this.processYamlFile(filePath, content, ruleSets);
        break;
      case '.json':
        await this.processJsonFile(filePath, content, ruleSets);
        break;
      case '.md':
        await this.processMarkdownFile(filePath, content, guidelines);
        break;
      case '.txt':
        await this.processTextFile(filePath, content, guidelines);
        break;
      default:
        this.logger.debug(`Skipping unsupported file type: ${filePath}`);
        break;
    }
  }

  /**
   * Process YAML file
   */
  private async processYamlFile(
    filePath: string,
    content: string,
    ruleSets: RuleSet[]
  ): Promise<void> {
    try {
      const data = yaml.load(content) as any;
      const ruleSet = this.parseRuleSet(data, filePath);
      
      if (ruleSet) {
        ruleSets.push(ruleSet);
        this.logger.debug(`Loaded ${ruleSet.rules.length} rules from ${filePath}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to parse YAML file ${filePath}: ${(error as Error).message}`);
    }
  }

  /**
   * Process JSON file
   */
  private async processJsonFile(
    filePath: string,
    content: string,
    ruleSets: RuleSet[]
  ): Promise<void> {
    try {
      const data = JSON.parse(content);
      const ruleSet = this.parseRuleSet(data, filePath);
      
      if (ruleSet) {
        ruleSets.push(ruleSet);
        this.logger.debug(`Loaded ${ruleSet.rules.length} rules from ${filePath}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to parse JSON file ${filePath}: ${(error as Error).message}`);
    }
  }

  /**
   * Process Markdown file
   */
  private async processMarkdownFile(
    filePath: string,
    content: string,
    guidelines: ProjectGuideline[]
  ): Promise<void> {
    const title = this.extractMarkdownTitle(content) || path.basename(filePath, '.md');
    
    guidelines.push({
      title,
      content: this.stripMarkdownFormatting(content),
      source: filePath,
      type: 'markdown'
    });
    
    this.logger.debug(`Loaded guideline "${title}" from ${filePath}`);
  }

  /**
   * Process text file
   */
  private async processTextFile(
    filePath: string,
    content: string,
    guidelines: ProjectGuideline[]
  ): Promise<void> {
    const title = path.basename(filePath, '.txt');
    
    guidelines.push({
      title,
      content,
      source: filePath,
      type: 'text'
    });
    
    this.logger.debug(`Loaded text guideline "${title}" from ${filePath}`);
  }

  /**
   * Parse rule set from data
   */
  private parseRuleSet(data: any, source: string): RuleSet | null {
    if (!data || typeof data !== 'object') {
      this.logger.warn(`Invalid rule set format in ${source}`);
      return null;
    }
    
    // Handle different formats
    let rules: any[] = [];
    let name = path.basename(source, path.extname(source));
    let version = '1.0.0';
    let description = '';
    let metadata = {};
    
    if (Array.isArray(data)) {
      // Array of rules
      rules = data;
    } else if (data.rules && Array.isArray(data.rules)) {
      // Object with rules property
      rules = data.rules;
      name = data.name || name;
      version = data.version || version;
      description = data.description || description;
      metadata = data.metadata || metadata;
    } else {
      this.logger.warn(`No rules found in ${source}`);
      return null;
    }
    
    // Parse individual rules
    const parsedRules: ReviewRule[] = [];
    
    for (let i = 0; i < rules.length; i++) {
      const rule = this.parseRule(rules[i], `${source}[${i}]`);
      if (rule) {
        parsedRules.push(rule);
      }
    }
    
    return {
      name,
      version,
      description,
      rules: parsedRules,
      metadata
    };
  }

  /**
   * Parse individual rule
   */
  private parseRule(data: any, source: string): ReviewRule | null {
    if (!data || typeof data !== 'object') {
      this.logger.warn(`Invalid rule format in ${source}`);
      return null;
    }
    
    // Required fields
    if (!data.id || !data.name) {
      this.logger.warn(`Rule missing required fields (id, name) in ${source}`);
      return null;
    }
    
    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      severity: this.parseSeverity(data.severity),
      category: data.category || 'general',
      pattern: data.pattern,
      fileTypes: Array.isArray(data.fileTypes) ? data.fileTypes : undefined,
      suggestion: data.suggestion,
      enabled: data.enabled !== false // Default to true
    };
  }

  /**
   * Parse severity level
   */
  private parseSeverity(severity: any): 'error' | 'warning' | 'info' {
    if (typeof severity === 'string') {
      const lower = severity.toLowerCase();
      if (lower === 'error' || lower === 'warning' || lower === 'info') {
        return lower as 'error' | 'warning' | 'info';
      }
    }
    return 'warning'; // Default
  }

  /**
   * Extract title from markdown content
   */
  private extractMarkdownTitle(content: string): string | null {
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ')) {
        return trimmed.substring(2).trim();
      }
    }
    
    return null;
  }

  /**
   * Strip markdown formatting for plain text
   */
  private stripMarkdownFormatting(content: string): string {
    return content
      // Remove headers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold/italic
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      // Remove links
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '[code block]')
      .replace(/`([^`]+)`/g, '$1')
      // Remove horizontal rules
      .replace(/^---+$/gm, '')
      // Clean up extra whitespace
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }

  /**
   * Merge multiple rule sets
   */
  public mergeRuleSets(ruleSets: RuleSet[]): RuleSet {
    if (ruleSets.length === 0) {
      return {
        name: 'empty',
        version: '1.0.0',
        rules: []
      };
    }
    
    if (ruleSets.length === 1) {
      return ruleSets[0]!;
    }
    
    const mergedRules: ReviewRule[] = [];
    const seenIds = new Set<string>();
    
    // Merge rules, avoiding duplicates
    for (const ruleSet of ruleSets) {
      for (const rule of ruleSet.rules) {
        if (!seenIds.has(rule.id)) {
          mergedRules.push(rule);
          seenIds.add(rule.id);
        } else {
          this.logger.debug(`Skipping duplicate rule: ${rule.id}`);
        }
      }
    }
    
    return {
      name: 'merged',
      version: '1.0.0',
      description: `Merged from ${ruleSets.length} rule sets`,
      rules: mergedRules,
      metadata: {
        sources: ruleSets.map(rs => rs.name)
      }
    };
  }

  /**
   * Filter rules by criteria
   */
  public filterRules(
    ruleSet: RuleSet,
    criteria: {
      enabled?: boolean;
      severity?: ('error' | 'warning' | 'info')[];
      category?: string[];
      fileTypes?: string[];
    }
  ): RuleSet {
    let filteredRules = ruleSet.rules;
    
    if (criteria.enabled !== undefined) {
      filteredRules = filteredRules.filter(rule => rule.enabled === criteria.enabled);
    }
    
    if (criteria.severity && criteria.severity.length > 0) {
      filteredRules = filteredRules.filter(rule => criteria.severity!.includes(rule.severity));
    }
    
    if (criteria.category && criteria.category.length > 0) {
      filteredRules = filteredRules.filter(rule => criteria.category!.includes(rule.category));
    }
    
    if (criteria.fileTypes && criteria.fileTypes.length > 0) {
      filteredRules = filteredRules.filter(rule => {
        if (!rule.fileTypes) return true; // Rules without file type restrictions apply to all
        return rule.fileTypes.some(type => criteria.fileTypes!.includes(type));
      });
    }
    
    return {
      ...ruleSet,
      rules: filteredRules
    };
  }

  /**
   * Get rules summary
   */
  public getSummary(loadedRules: LoadedRules): string {
    const { ruleSets, guidelines, totalRules, enabledRules } = loadedRules;
    
    const parts = [
      `${ruleSets.length} rule sets`,
      `${totalRules} total rules`,
      `${enabledRules} enabled`,
      `${guidelines.length} guidelines`
    ];
    
    return parts.join(', ');
  }
}