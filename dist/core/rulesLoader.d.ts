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
export declare class RulesLoader {
    private logger;
    private errorHandler;
    constructor(logger: Logger, errorHandler: ErrorHandler);
    /**
     * Load rules from multiple sources
     */
    loadRules(rulesPaths: string[], projectRulesPath?: string): Promise<LoadedRules>;
    /**
     * Process a single rules path (file or glob pattern)
     */
    private processRulesPath;
    /**
     * Process a single file
     */
    private processFile;
    /**
     * Process directory
     */
    private processDirectory;
    /**
     * Process single file
     */
    private processSingleFile;
    /**
     * Process YAML file
     */
    private processYamlFile;
    /**
     * Process JSON file
     */
    private processJsonFile;
    /**
     * Process Markdown file
     */
    private processMarkdownFile;
    /**
     * Process text file
     */
    private processTextFile;
    /**
     * Parse rule set from data
     */
    private parseRuleSet;
    /**
     * Parse individual rule
     */
    private parseRule;
    /**
     * Parse severity level
     */
    private parseSeverity;
    /**
     * Extract title from markdown content
     */
    private extractMarkdownTitle;
    /**
     * Strip markdown formatting for plain text
     */
    private stripMarkdownFormatting;
    /**
     * Merge multiple rule sets
     */
    mergeRuleSets(ruleSets: RuleSet[]): RuleSet;
    /**
     * Filter rules by criteria
     */
    filterRules(ruleSet: RuleSet, criteria: {
        enabled?: boolean;
        severity?: ('error' | 'warning' | 'info')[];
        category?: string[];
        fileTypes?: string[];
    }): RuleSet;
    /**
     * Get rules summary
     */
    getSummary(loadedRules: LoadedRules): string;
}
//# sourceMappingURL=rulesLoader.d.ts.map