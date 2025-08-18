"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewOrchestrator = void 0;
const os_1 = __importDefault(require("os"));
const errorHandler_1 = require("./errorHandler");
const argsParser_js_1 = require("../cli/argsParser.js");
const configLoader_1 = require("./configLoader");
const adoClient_1 = require("./adoClient");
const gitManager_1 = require("./gitManager");
const diffFetcher_1 = require("./diffFetcher");
const rulesLoader_1 = require("./rulesLoader");
const contextBuilder_1 = require("./contextBuilder");
const reviewPlanner_1 = require("./reviewPlanner");
const geminiAdapter_1 = require("./geminiAdapter");
const resultMapper_1 = require("./resultMapper");
const commenter_1 = require("./commenter");
const statusReporter_1 = require("./statusReporter");
const workspace_1 = require("./workspace");
const chalk_1 = __importDefault(require("chalk"));
class ReviewOrchestrator {
    logger;
    errorHandler;
    options;
    argsParser;
    configLoader;
    // Core components
    adoClient;
    gitManager;
    diffFetcher;
    rulesLoader;
    contextBuilder;
    reviewPlanner;
    geminiAdapter;
    resultMapper;
    commenter;
    statusReporter;
    workspace;
    constructor(logger, options) {
        this.logger = logger;
        this.errorHandler = new errorHandler_1.ErrorHandler(logger);
        this.argsParser = new argsParser_js_1.ArgsParser(logger);
        this.configLoader = new configLoader_1.ConfigLoader(logger, this.errorHandler);
        this.options = {}; // Will be set in initialize
        // Store raw options for later parsing
        this.rawOptions = options;
    }
    rawOptions;
    /**
     * Main orchestration method
     */
    async run() {
        const startTime = Date.now();
        let workspace;
        try {
            // Step 1: Initialize and validate options
            this.logger.step(1, 8, 'Initializing and validating options...');
            this.logger.debug('Starting step 1: Initialize');
            await this.initialize();
            this.logger.debug('Completed step 1: Initialize');
            // Step 2: Setup workspace
            this.logger.step(2, 8, 'Setting up temporary workspace...');
            this.logger.debug('Starting step 2: Setup workspace');
            workspace = await this.setupWorkspace();
            this.logger.debug('Completed step 2: Setup workspace');
            // Step 3: Fetch PR information and diffs
            this.logger.step(3, 8, 'Fetching PR information and changes...');
            this.logger.debug('Starting step 3: Fetch PR info and diffs');
            const prInfo = await this.fetchPRInfo();
            this.logger.debug('Completed fetchPRInfo');
            const diffs = await this.fetchDiffs(prInfo);
            this.logger.debug('Completed step 3: Fetch PR info and diffs');
            // Step 4: Load rules and build context
            this.logger.step(4, 8, 'Loading rules and building review context...');
            this.logger.debug('Starting step 4: Load rules and build context');
            const rules = await this.loadRules();
            this.logger.debug('Completed loadRules');
            const context = await this.buildContext(rules, diffs);
            this.logger.debug('Completed step 4: Load rules and build context');
            // Step 5: Plan and execute review
            this.logger.step(5, 8, 'Planning and executing AI review...');
            this.logger.debug('Starting step 5: Plan and execute review');
            const reviewPlan = await this.planReview(context);
            this.logger.debug('Completed planReview');
            const findings = await this.executeReview(reviewPlan, context);
            this.logger.debug('Completed step 5: Plan and execute review');
            // Step 6: Process and filter findings
            this.logger.step(6, 8, 'Processing and filtering findings...');
            this.logger.debug('Starting step 6: Process findings');
            const processedFindings = await this.processFindings(findings);
            this.logger.debug('Completed step 6: Process findings');
            // Step 7: Get user approval and post comments
            this.logger.step(7, 8, 'Getting approval and posting comments...');
            this.logger.debug('Starting step 7: Get approval and post comments');
            const approvedFindings = await this.getApproval(processedFindings);
            this.logger.debug('Completed getApproval');
            const commentsPosted = await this.postComments(approvedFindings, prInfo);
            this.logger.debug('Completed step 7: Get approval and post comments');
            // Step 8: Update PR status and cleanup
            this.logger.step(8, 8, 'Updating PR status and cleaning up...');
            this.logger.debug('Starting step 8: Update PR status');
            await this.updatePRStatus(prInfo, processedFindings);
            this.logger.debug('Completed step 8: Update PR status');
            const processingTime = Date.now() - startTime;
            this.logger.success(`Review completed successfully in ${processingTime}ms`);
            return {
                hasErrors: false,
                hasFindings: processedFindings.length > 0,
                findingsCount: processedFindings.length,
                commentsPosted,
                processingTime
            };
        }
        catch (error) {
            const processingTime = Date.now() - startTime;
            this.logger.error('Error occurred during review process:', {
                errorMessage: error.message,
                errorStack: error.stack,
                processingTime
            });
            if (error instanceof errorHandler_1.ReviewError) {
                return {
                    hasErrors: true,
                    hasFindings: false,
                    findingsCount: 0,
                    commentsPosted: 0,
                    processingTime
                };
            }
            throw error;
        }
        finally {
            // Always cleanup workspace
            if (workspace && !this.options.keepWorkdir) {
                try {
                    await workspace.cleanup();
                    this.logger.debug('Workspace cleaned up successfully');
                }
                catch (error) {
                    this.logger.warn(`Failed to cleanup workspace: ${error}`);
                }
            }
        }
    }
    /**
     * Initialize components and validate options
     */
    async initialize() {
        try {
            // Parse and validate options
            this.options = await this.argsParser.parseOptions(this.rawOptions);
            // Parse PR information
            const prInfo = this.argsParser.parsePRInfo(this.options);
            let org = '', project = '', repo = '';
            if (prInfo.type === 'url' && prInfo.url) {
                const repoInfo = this.argsParser.extractRepoInfoFromUrl(prInfo.url);
                if (repoInfo) {
                    org = repoInfo.org;
                    project = repoInfo.project;
                    repo = repoInfo.repo;
                }
                else {
                    throw new Error('Could not extract repository information from PR URL');
                }
            }
            else if (prInfo.type === 'id') {
                org = prInfo.org || '';
                project = prInfo.project || '';
                // Handle --repo parameter: if it's a URL, extract just the repo name
                let repoParam = prInfo.repo || '';
                if (repoParam.includes('://')) {
                    // It's a URL, extract repo info
                    const repoInfo = this.argsParser.extractRepoInfoFromUrl(repoParam);
                    if (repoInfo) {
                        repo = repoInfo.repo;
                    }
                    else {
                        throw new Error(`Could not extract repository name from URL: ${repoParam}`);
                    }
                }
                else {
                    // It's already a repo name
                    repo = repoParam;
                }
            }
            // Load configuration
            this.logger.info('Loading configuration...');
            await this.configLoader.getConfig();
            // Initialize core components
            this.adoClient = new adoClient_1.ADOClient(org, project, repo, process.env['AZURE_DEVOPS_PAT'] || '', this.logger, this.errorHandler);
            this.gitManager = new gitManager_1.GitManager(this.logger, this.errorHandler);
            this.diffFetcher = new diffFetcher_1.DiffFetcher(this.adoClient, this.gitManager, this.logger, this.errorHandler);
            this.rulesLoader = new rulesLoader_1.RulesLoader(this.logger, this.errorHandler);
            this.contextBuilder = new contextBuilder_1.ContextBuilder(this.logger, this.errorHandler);
            this.reviewPlanner = new reviewPlanner_1.ReviewPlanner(this.logger, this.errorHandler);
            // GeminiAdapter - now with timeout from config
            const geminiConfig = await this.configLoader.getGeminiConfig();
            this.logger.debug(`Initializing GeminiAdapter with timeout: ${geminiConfig.timeout}ms`);
            this.geminiAdapter = new geminiAdapter_1.GeminiAdapter(this.logger, this.errorHandler, geminiConfig.timeout);
            this.resultMapper = new resultMapper_1.ResultMapper(this.logger, this.errorHandler);
            this.commenter = new commenter_1.Commenter(this.logger, this.errorHandler, this.adoClient);
            this.statusReporter = new statusReporter_1.StatusReporter(this.logger, this.errorHandler, this.adoClient);
            this.logger.debug('All components initialized successfully');
        }
        catch (error) {
            throw this.errorHandler.createInternalError('Failed to initialize review orchestrator', { operation: 'initialize' }, error instanceof Error ? error : undefined);
        }
    }
    /**
     * Setup workspace for review
     */
    async setupWorkspace() {
        this.workspace = new workspace_1.Workspace(this.logger, this.errorHandler, {
            baseDir: this.options.tmpDir || os_1.default.tmpdir(),
            prefix: 'ado-review',
            keepOnExit: false
        });
        await this.workspace.create();
        // Update logger to use workspace directory for logs
        this.logger.workspaceDir = this.workspace.getPath();
        return this.workspace;
    }
    /**
     * Extract PR ID from Azure DevOps URL
     */
    extractPRIdFromUrl(url) {
        const match = url.match(/pullrequest\/(\d+)/);
        if (!match || !match[1]) {
            throw new Error(`Invalid PR URL format: ${url}`);
        }
        return parseInt(match[1]);
    }
    /**
     * Fetch PR information
     */
    async fetchPRInfo() {
        if (!this.adoClient) {
            throw this.errorHandler.createInternalError('ADO client not initialized');
        }
        const prInfo = this.argsParser.parsePRInfo(this.options);
        if (prInfo.type === 'url') {
            // For URL-based PR, we need to extract PR ID and use getPullRequest
            const prId = this.extractPRIdFromUrl(prInfo.url);
            return await this.adoClient.getPullRequest(prId);
        }
        else {
            return await this.adoClient.getPullRequest(parseInt(prInfo.id));
        }
    }
    /**
     * Fetch PR diffs
     */
    async fetchDiffs(prInfo) {
        if (!this.diffFetcher || !this.gitManager || !this.workspace) {
            throw this.errorHandler.createInternalError('Required components not initialized');
        }
        this.logger.debug('fetchDiffs - prInfo structure:', {
            hasRepository: !!prInfo.repository,
            hasPullRequestId: !!prInfo.pullRequestId,
            hasSourceRefName: !!prInfo.sourceRefName,
            prInfoKeys: Object.keys(prInfo || {})
        });
        if (!prInfo.repository) {
            throw this.errorHandler.createInternalError('PR info does not contain repository information');
        }
        // Clone repository to workspace/source directory
        const sourceDir = this.workspace.getSubdirPath('source');
        await this.gitManager.cloneRepository(prInfo.repository.remoteUrl, {
            branch: prInfo.sourceRefName,
            workingDirectory: sourceDir
        });
        // Fetch PR diff
        const prDiff = await this.diffFetcher.fetchPullRequestDiff(prInfo.pullRequestId, sourceDir);
        // Log the diff for debugging
        this.logger.logDiff(`pr-${prInfo.pullRequestId}`, JSON.stringify(prDiff, null, 2));
        return prDiff;
    }
    /**
     * Load rules from files
     */
    async loadRules() {
        if (!this.rulesLoader) {
            throw this.errorHandler.createInternalError('Rules loader not initialized');
        }
        return await this.rulesLoader.loadRules(this.options.rules, this.options.projectRules);
    }
    /**
     * Build review context
     */
    async buildContext(rules, diffs) {
        if (!this.contextBuilder) {
            throw this.errorHandler.createInternalError('Context builder not initialized');
        }
        // Convert PullRequestDiff to DiffHunk[]
        const diffHunks = this.convertPullRequestDiffToHunks(diffs);
        const contextOptions = {
            maxTokens: this.options.maxContextTokens,
            includeMetadata: true,
            compactFormat: false
        };
        if (this.options.customPromptTemplate) {
            contextOptions.customPromptTemplate = this.options.customPromptTemplate;
        }
        return await this.contextBuilder.buildContext(rules, diffHunks, contextOptions);
    }
    /**
     * Convert PullRequestDiff to DiffHunk[] format expected by ContextBuilder
     */
    convertPullRequestDiffToHunks(pullRequestDiff) {
        const diffHunks = [];
        if (!pullRequestDiff || !pullRequestDiff.files) {
            return diffHunks;
        }
        for (const file of pullRequestDiff.files) {
            for (const hunk of file.hunks) {
                diffHunks.push({
                    filePath: file.filePath,
                    oldStartLine: hunk.oldLineStart,
                    oldLineCount: hunk.oldLineCount,
                    newStartLine: hunk.newLineStart,
                    newLineCount: hunk.newLineCount,
                    content: hunk.content,
                    changeType: hunk.changeType
                });
            }
        }
        return diffHunks;
    }
    /**
     * Plan review strategy
     */
    async planReview(context) {
        if (!this.reviewPlanner) {
            throw this.errorHandler.createInternalError('Review planner not initialized');
        }
        // Extract diffHunks from context
        const diffHunks = context.diffHunks || [];
        // Create planning options from context or use defaults
        const planningOptions = {
            maxTokensPerBatch: context.maxTokens || 8000,
            maxFilesPerBatch: 10,
            maxHunksPerBatch: 50,
            batchStrategy: 'mixed',
            prioritizeFileTypes: ['.ts', '.js', '.tsx', '.jsx'],
            excludeFileTypes: ['.lock', '.log', '.tmp']
        };
        return await this.reviewPlanner.createPlan(diffHunks, planningOptions);
    }
    /**
     * Execute AI review
     */
    async executeReview(reviewPlan, context) {
        if (!this.geminiAdapter) {
            throw this.errorHandler.createInternalError('Review components not initialized');
        }
        this.logger.debug('Executing Gemini review with context', {
            contextType: typeof context,
            planType: typeof reviewPlan,
            hasContext: !!context,
            hasPlan: !!reviewPlan
        });
        const reviewResult = await this.geminiAdapter.reviewCode(context, {
            model: this.options.model,
            maxTokens: this.options.maxContextTokens,
            temperature: 0.1
        });
        return reviewResult.findings;
    }
    /**
     * Process and filter findings
     */
    async processFindings(findings) {
        // Filter by severity threshold
        const severityOrder = { info: 0, warning: 1, error: 2 };
        const thresholdLevel = severityOrder[this.options.severityThreshold];
        const filtered = findings.filter(finding => severityOrder[finding.severity] >= thresholdLevel);
        this.logger.info(`Found ${findings.length} total findings, ${filtered.length} above threshold`);
        return filtered;
    }
    /**
     * Get user approval for findings
     */
    async getApproval(findings) {
        if (this.options.autoApprove) {
            this.logger.info('Auto-approve enabled, posting all findings');
            return findings;
        }
        // Always display findings first
        this.displayFindings(findings);
        if (this.options.dryRun) {
            this.logger.info('\n' + chalk_1.default.yellow('🔍 Dry-run mode: Review completed, no comments will be posted to Azure DevOps'));
            return [];
        }
        // Interactive approval
        return await this.promptUserApproval(findings);
    }
    /**
     * Post comments to PR
     */
    async postComments(findings, prInfo) {
        if (!this.commenter || !this.resultMapper) {
            throw this.errorHandler.createInternalError('Commenter not initialized');
        }
        if (findings.length === 0) {
            this.logger.info('No findings to post');
            return 0;
        }
        // Map findings to comment threads
        const reviewResult = {
            findings,
            metadata: {
                reviewId: Date.now().toString(),
                reviewedFiles: new Set(findings.map(f => f.file)).size,
                reviewedLines: 0, // TODO: Calculate from diff
                totalIssues: findings.length,
                issuesBySeverity: {
                    error: findings.filter(f => f.severity === 'error').length,
                    warning: findings.filter(f => f.severity === 'warning').length,
                    info: findings.filter(f => f.severity === 'info').length
                }
            }
        };
        const mappingResult = this.resultMapper.mapToCommentThreads(reviewResult);
        // Post comments
        const commentResult = await this.commenter.postComments(prInfo.pullRequestId, mappingResult);
        return commentResult.commentsCreated;
    }
    /**
     * Update PR status
     */
    async updatePRStatus(prInfo, findings) {
        if (!this.options.postStatus || !this.statusReporter) {
            return;
        }
        const hasErrors = findings.some(f => f.severity === 'error');
        // Create review summary
        const summary = {
            totalFindings: findings.length,
            criticalFindings: findings.filter(f => f.severity === 'error').length,
            majorFindings: findings.filter(f => f.severity === 'warning').length,
            minorFindings: findings.filter(f => f.severity === 'info').length,
            infoFindings: findings.filter(f => f.severity === 'info').length,
            filesReviewed: new Set(findings.map(f => f.file)).size,
            linesReviewed: 0, // TODO: Calculate from diff
            reviewDuration: 0, // TODO: Track review duration
            success: !hasErrors,
            errors: []
        };
        if (hasErrors) {
            await this.statusReporter.setFailed(prInfo.pullRequestId, summary);
        }
        else {
            await this.statusReporter.setSuccess(prInfo.pullRequestId, summary);
        }
    }
    /**
     * Display findings in console
     */
    /**
     * Prompt user for approval of findings
     */
    async promptUserApproval(findings) {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        const question = (query) => {
            return new Promise(resolve => {
                rl.question(query, resolve);
            });
        };
        try {
            console.log('\n' + chalk_1.default.blue('📝 Review Summary:'));
            console.log(chalk_1.default.gray(`Total findings: ${findings.length}`));
            const severityCounts = {
                error: findings.filter(f => f.severity === 'error').length,
                warning: findings.filter(f => f.severity === 'warning').length,
                info: findings.filter(f => f.severity === 'info').length
            };
            if (severityCounts.error > 0)
                console.log(chalk_1.default.red(`  • Errors: ${severityCounts.error}`));
            if (severityCounts.warning > 0)
                console.log(chalk_1.default.yellow(`  • Warnings: ${severityCounts.warning}`));
            if (severityCounts.info > 0)
                console.log(chalk_1.default.blue(`  • Info: ${severityCounts.info}`));
            console.log('\n' + chalk_1.default.cyan('Options:'));
            console.log('  [a] Approve all findings and post to Azure DevOps');
            console.log('  [s] Select specific findings to post');
            console.log('  [n] Cancel - do not post any comments');
            const answer = await question('\nWhat would you like to do? [a/s/n]: ');
            switch (answer.toLowerCase().trim()) {
                case 'a':
                case 'approve':
                    console.log(chalk_1.default.green('✅ All findings approved for posting'));
                    return findings;
                case 's':
                case 'select':
                    return await this.selectiveApproval(findings, question);
                case 'n':
                case 'no':
                case 'cancel':
                    console.log(chalk_1.default.yellow('❌ Review cancelled - no comments will be posted'));
                    return [];
                default:
                    console.log(chalk_1.default.red('Invalid option. Cancelling review.'));
                    return [];
            }
        }
        finally {
            rl.close();
        }
    }
    /**
     * Allow user to selectively approve findings
     */
    async selectiveApproval(findings, question) {
        const approvedFindings = [];
        console.log('\n' + chalk_1.default.cyan('Select findings to post (y/n for each):'));
        for (let i = 0; i < findings.length; i++) {
            const finding = findings[i];
            if (!finding)
                continue;
            const severityColor = finding.severity === 'error' ? chalk_1.default.red :
                finding.severity === 'warning' ? chalk_1.default.yellow : chalk_1.default.blue;
            console.log(`\n${i + 1}. ${severityColor(finding.severity.toUpperCase())} - ${finding.file}:${finding.line}`);
            console.log(`   ${finding.message}`);
            if (finding.suggestion) {
                console.log(chalk_1.default.gray(`   Suggestion: ${finding.suggestion}`));
            }
            const answer = await question(`   Post this finding? [y/n]: `);
            if (answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes') {
                approvedFindings.push(finding);
                console.log(chalk_1.default.green('   ✅ Approved'));
            }
            else {
                console.log(chalk_1.default.gray('   ⏭️  Skipped'));
            }
        }
        console.log(`\n${chalk_1.default.green('✅ Selected')} ${approvedFindings.length} out of ${findings.length} findings for posting`);
        return approvedFindings;
    }
    displayFindings(findings) {
        if (findings.length === 0) {
            this.logger.info(chalk_1.default.green('✅ No issues found!'));
            return;
        }
        if (this.options.format === 'json') {
            console.log(JSON.stringify(findings, null, 2));
        }
        else {
            this.logger.table(findings.map(f => ({
                File: f.file,
                Line: f.line,
                Severity: f.severity.toUpperCase(),
                Message: f.message,
                Rule: f.ruleId || 'N/A'
            })));
        }
    }
}
exports.ReviewOrchestrator = ReviewOrchestrator;
//# sourceMappingURL=reviewOrchestrator.js.map