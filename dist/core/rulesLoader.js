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
exports.RulesLoader = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const glob_1 = require("glob");
class RulesLoader {
    constructor(logger, errorHandler) {
        this.logger = logger;
        this.errorHandler = errorHandler;
    }
    /**
     * Load rules from multiple sources
     */
    async loadRules(rulesPaths, projectRulesPath) {
        try {
            this.logger.info('Loading review rules and guidelines');
            const ruleSets = [];
            const guidelines = [];
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
            const enabledRules = ruleSets.reduce((sum, ruleSet) => sum + ruleSet.rules.filter(rule => rule.enabled).length, 0);
            this.logger.info(`Loaded ${ruleSets.length} rule sets, ${totalRules} total rules (${enabledRules} enabled), ${guidelines.length} guidelines`);
            return {
                ruleSets,
                guidelines,
                totalRules,
                enabledRules
            };
        }
        catch (error) {
            throw this.errorHandler.createFromError(error, 'Failed to load rules', {
                operation: 'loadRules',
                component: 'RulesLoader',
                metadata: { rulesPaths, projectRulesPath }
            });
        }
    }
    /**
     * Process a single rules path (file or glob pattern)
     */
    async processRulesPath(rulesPath, ruleSets, guidelines) {
        this.logger.debug(`Processing rules path: ${rulesPath}`);
        // Check if it's a glob pattern
        if (rulesPath.includes('*') || rulesPath.includes('?')) {
            const files = await (0, glob_1.glob)(rulesPath);
            this.logger.debug(`Glob pattern matched ${files.length} files`);
            for (const file of files) {
                await this.processFile(file, ruleSets, guidelines);
            }
        }
        else {
            // Single file or directory
            await this.processFile(rulesPath, ruleSets, guidelines);
        }
    }
    /**
     * Process a single file
     */
    async processFile(filePath, ruleSets, guidelines) {
        try {
            if (!fs.existsSync(filePath)) {
                this.logger.warn(`File not found: ${filePath}`);
                return;
            }
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
                // Process directory
                await this.processDirectory(filePath, ruleSets, guidelines);
            }
            else {
                // Process single file
                await this.processSingleFile(filePath, ruleSets, guidelines);
            }
        }
        catch (error) {
            this.logger.warn(`Failed to process file ${filePath}: ${error.message}`);
            // Continue with other files
        }
    }
    /**
     * Process directory
     */
    async processDirectory(dirPath, ruleSets, guidelines) {
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
    async processSingleFile(filePath, ruleSets, guidelines) {
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
    async processYamlFile(filePath, content, ruleSets) {
        try {
            const data = yaml.load(content);
            const ruleSet = this.parseRuleSet(data, filePath);
            if (ruleSet) {
                ruleSets.push(ruleSet);
                this.logger.debug(`Loaded ${ruleSet.rules.length} rules from ${filePath}`);
            }
        }
        catch (error) {
            this.logger.warn(`Failed to parse YAML file ${filePath}: ${error.message}`);
        }
    }
    /**
     * Process JSON file
     */
    async processJsonFile(filePath, content, ruleSets) {
        try {
            const data = JSON.parse(content);
            const ruleSet = this.parseRuleSet(data, filePath);
            if (ruleSet) {
                ruleSets.push(ruleSet);
                this.logger.debug(`Loaded ${ruleSet.rules.length} rules from ${filePath}`);
            }
        }
        catch (error) {
            this.logger.warn(`Failed to parse JSON file ${filePath}: ${error.message}`);
        }
    }
    /**
     * Process Markdown file
     */
    async processMarkdownFile(filePath, content, guidelines) {
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
    async processTextFile(filePath, content, guidelines) {
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
    parseRuleSet(data, source) {
        if (!data || typeof data !== 'object') {
            this.logger.warn(`Invalid rule set format in ${source}`);
            return null;
        }
        // Handle different formats
        let rules = [];
        let name = path.basename(source, path.extname(source));
        let version = '1.0.0';
        let description = '';
        let metadata = {};
        if (Array.isArray(data)) {
            // Array of rules
            rules = data;
        }
        else if (data.rules && Array.isArray(data.rules)) {
            // Object with rules property
            rules = data.rules;
            name = data.name || name;
            version = data.version || version;
            description = data.description || description;
            metadata = data.metadata || metadata;
        }
        else {
            this.logger.warn(`No rules found in ${source}`);
            return null;
        }
        // Parse individual rules
        const parsedRules = [];
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
    parseRule(data, source) {
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
    parseSeverity(severity) {
        if (typeof severity === 'string') {
            const lower = severity.toLowerCase();
            if (lower === 'error' || lower === 'warning' || lower === 'info') {
                return lower;
            }
        }
        return 'warning'; // Default
    }
    /**
     * Extract title from markdown content
     */
    extractMarkdownTitle(content) {
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
    stripMarkdownFormatting(content) {
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
    mergeRuleSets(ruleSets) {
        if (ruleSets.length === 0) {
            return {
                name: 'empty',
                version: '1.0.0',
                rules: []
            };
        }
        if (ruleSets.length === 1) {
            return ruleSets[0];
        }
        const mergedRules = [];
        const seenIds = new Set();
        // Merge rules, avoiding duplicates
        for (const ruleSet of ruleSets) {
            for (const rule of ruleSet.rules) {
                if (!seenIds.has(rule.id)) {
                    mergedRules.push(rule);
                    seenIds.add(rule.id);
                }
                else {
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
    filterRules(ruleSet, criteria) {
        let filteredRules = ruleSet.rules;
        if (criteria.enabled !== undefined) {
            filteredRules = filteredRules.filter(rule => rule.enabled === criteria.enabled);
        }
        if (criteria.severity && criteria.severity.length > 0) {
            filteredRules = filteredRules.filter(rule => criteria.severity.includes(rule.severity));
        }
        if (criteria.category && criteria.category.length > 0) {
            filteredRules = filteredRules.filter(rule => criteria.category.includes(rule.category));
        }
        if (criteria.fileTypes && criteria.fileTypes.length > 0) {
            filteredRules = filteredRules.filter(rule => {
                if (!rule.fileTypes)
                    return true; // Rules without file type restrictions apply to all
                return rule.fileTypes.some(type => criteria.fileTypes.includes(type));
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
    getSummary(loadedRules) {
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
exports.RulesLoader = RulesLoader;
//# sourceMappingURL=rulesLoader.js.map