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
exports.GeminiAdapter = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const yaml = __importStar(require("js-yaml"));
class GeminiAdapter {
    logger;
    errorHandler;
    tempDir;
    defaultTimeout;
    constructor(logger, errorHandler, defaultTimeout = 30000) {
        this.logger = logger;
        this.errorHandler = errorHandler;
        this.tempDir = path.join(os.tmpdir(), 'ado-review-gemini');
        this.defaultTimeout = defaultTimeout;
        this.ensureTempDir();
        this.logger.debug(`GeminiAdapter initialized with default timeout: ${this.defaultTimeout}ms`);
    }
    /**
     * Review code using Gemini
     */
    async reviewCode(context, config) {
        try {
            this.logger.info(`Starting Gemini review with model: ${config.model}`);
            const requestId = this.generateRequestId();
            const prompt = this.buildReviewPrompt(context);
            const request = {
                prompt,
                // Cast to local config for typing; fields are compatible
                config: config,
                requestId
            };
            const response = await this.callGemini(request);
            if (response.error) {
                throw new Error(`Gemini API error: ${response.error}`);
            }
            const result = this.parseReviewResponse(response.content);
            this.logger.info(`Review completed: ${result.findings.length} findings`);
            return result;
        }
        catch (error) {
            this.logger.error(`Error in reviewCode: ${error.message}`);
            throw this.errorHandler.createInternalError(`Review failed: ${error.message}`);
        }
    }
    /**
     * Call Gemini CLI with the given request
     */
    async callGemini(request) {
        const { prompt, config, requestId } = request;
        const maxRetries = config.retryAttempts || 3;
        const baseDelay = config.retryDelay || 1000;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const timeout = config.timeout || this.defaultTimeout;
                const result = await this.executeGeminiCommandWithStdin(prompt, timeout);
                const response = {
                    requestId,
                    content: result.stdout,
                    model: config.model
                };
                const usage = this.extractUsageInfo(result.stderr);
                if (usage) {
                    response.usage = usage;
                }
                const finishReason = this.extractFinishReason(result.stderr);
                if (finishReason) {
                    response.finishReason = finishReason;
                }
                // Log the Gemini response for debugging
                this.logger.logGeminiResponse(requestId, JSON.stringify(response, null, 2));
                return response;
            }
            catch (error) {
                const errorMessage = error.message;
                const isRateLimitError = this.isRateLimitError(errorMessage);
                // Check if it's a timeout error (for future use)
                // const isTimeoutError = errorMessage.includes('timeout');
                this.logger.warn(`Attempt ${attempt}/${maxRetries} failed: ${errorMessage}`);
                // If this is the last attempt, throw the error
                if (attempt === maxRetries) {
                    this.logger.error(`All ${maxRetries} attempts failed. Final error: ${errorMessage}`);
                    throw error;
                }
                // Calculate exponential backoff delay
                const delay = this.calculateBackoffDelay(attempt, baseDelay, isRateLimitError);
                this.logger.info(`Retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
                await this.sleep(delay);
            }
        }
        throw new Error('Unexpected error: retry loop completed without success or failure');
    }
    /**
     * Check if error is a rate limit error (429)
     */
    isRateLimitError(errorMessage) {
        return errorMessage.includes('429') ||
            errorMessage.includes('rateLimitExceeded') ||
            errorMessage.includes('Resource exhausted') ||
            errorMessage.includes('Too Many Requests');
    }
    /**
     * Calculate exponential backoff delay with jitter
     */
    calculateBackoffDelay(attempt, baseDelay, isRateLimitError) {
        // For rate limit errors, use longer delays
        const multiplier = isRateLimitError ? 2 : 1.5;
        const maxDelay = isRateLimitError ? 60000 : 30000; // 60s for rate limits, 30s for others
        // Exponential backoff: baseDelay * multiplier^(attempt-1)
        let delay = baseDelay * Math.pow(multiplier, attempt - 1);
        // Cap the delay
        delay = Math.min(delay, maxDelay);
        // Add jitter (±25% randomization)
        const jitter = delay * 0.25 * (Math.random() - 0.5);
        delay += jitter;
        return Math.max(delay, baseDelay); // Ensure minimum delay
    }
    /**
     * Sleep for specified milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Execute Gemini CLI command with stdin approach
     */
    async executeGeminiCommandWithStdin(prompt, timeout) {
        return new Promise((resolve, reject) => {
            this.logger.debug('Spawning Gemini CLI with stdin approach');
            const child = (0, child_process_1.spawn)('gemini', [], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env }
            });
            let stdout = '';
            let stderr = '';
            const timeoutId = setTimeout(() => {
                this.logger.error(`Gemini CLI timeout after ${timeout}ms`);
                child.kill('SIGTERM');
                reject(new Error(`Gemini CLI timeout after ${timeout}ms`));
            }, timeout);
            child.stdout?.on('data', (data) => {
                const chunk = data.toString();
                stdout += chunk;
                this.logger.debug(`Gemini CLI stdout: ${chunk.trim()}`);
            });
            child.stderr?.on('data', (data) => {
                const chunk = data.toString();
                stderr += chunk;
                this.logger.debug(`Gemini CLI stderr: ${chunk.trim()}`);
            });
            child.on('close', (code) => {
                clearTimeout(timeoutId);
                this.logger.debug(`Gemini CLI exited with code: ${code}`);
                this.logger.debug(`Gemini CLI final stdout: ${stdout.trim()}`);
                this.logger.debug(`Gemini CLI final stderr: ${stderr.trim()}`);
                if (code === 0) {
                    resolve({
                        stdout: this.cleanGeminiOutput(stdout.trim()),
                        stderr: stderr.trim()
                    });
                }
                else {
                    const errorMsg = `Gemini CLI exited with code ${code}: ${stderr}`;
                    this.logger.error(errorMsg);
                    reject(new Error(errorMsg));
                }
            });
            child.on('error', (error) => {
                clearTimeout(timeoutId);
                this.logger.error(`Gemini CLI spawn error: ${error.message}`);
                reject(error);
            });
            // Write prompt to stdin
            if (child.stdin) {
                child.stdin.write(prompt);
                child.stdin.end();
            }
        });
    }
    /**
     * Extract usage information from Gemini CLI output
     */
    extractUsageInfo(output) {
        try {
            // Look for token usage patterns in the output
            const promptTokensMatch = output.match(/prompt[_\s]tokens[:\s]+(\d+)/i);
            const completionTokensMatch = output.match(/completion[_\s]tokens[:\s]+(\d+)/i);
            const totalTokensMatch = output.match(/total[_\s]tokens[:\s]+(\d+)/i);
            if (promptTokensMatch?.[1] && completionTokensMatch?.[1]) {
                const promptTokens = parseInt(promptTokensMatch[1], 10);
                const completionTokens = parseInt(completionTokensMatch[1], 10);
                return {
                    promptTokens,
                    completionTokens,
                    totalTokens: totalTokensMatch?.[1] ? parseInt(totalTokensMatch[1], 10) :
                        promptTokens + completionTokens
                };
            }
        }
        catch (error) {
            this.logger.debug(`Failed to extract usage info: ${error.message}`);
        }
        return undefined;
    }
    /**
     * Extract finish reason from Gemini CLI output
     */
    extractFinishReason(output) {
        const finishReasonMatch = output.match(/finish[_\s]reason[:\s]+([a-zA-Z_]+)/i);
        return finishReasonMatch ? finishReasonMatch[1] : undefined;
    }
    /**
     * Build review prompt from context
     */
    buildReviewPrompt(context) {
        let prompt;
        // Use custom prompt template if provided
        if (context.customPromptTemplate) {
            prompt = this.applyCustomTemplate(context, context.customPromptTemplate);
        }
        else {
            // Use default prompt structure
            const sections = [];
            sections.push('You are an expert code reviewer. Please review the following code changes according to the provided guidelines and rules.');
            sections.push('');
            if (context.projectGuidelines.trim()) {
                sections.push('## Project Guidelines');
                sections.push(context.projectGuidelines);
                sections.push('');
            }
            if (context.reviewRules.trim()) {
                sections.push('## Review Rules');
                sections.push(context.reviewRules);
                sections.push('');
            }
            sections.push('## Code Changes to Review');
            sections.push(context.diffs);
            sections.push('');
            sections.push('## Instructions');
            sections.push('Please review the code changes and provide feedback in the following JSON format:');
            sections.push('');
            sections.push('```json');
            sections.push('{');
            sections.push('  "findings": [');
            sections.push('    {');
            sections.push('      "file": "path/to/file",');
            sections.push('      "line": 123,');
            sections.push('      "endLine": 125,');
            sections.push('      "severity": "warning",');
            sections.push('      "message": "Issue description",');
            sections.push('      "suggestion": "Suggested fix",');
            sections.push('      "ruleId": "rule-id",');
            sections.push('      "category": "category-name"');
            sections.push('    }');
            sections.push('  ],');
            sections.push('  "summary": "Overall review summary"');
            sections.push('}');
            sections.push('```');
            sections.push('');
            sections.push('Focus on:');
            sections.push('- Code quality and best practices');
            sections.push('- Potential bugs and security issues');
            sections.push('- Performance considerations');
            sections.push('- Maintainability and readability');
            sections.push('- Adherence to project guidelines and rules');
            sections.push('');
            sections.push('Only report actual issues. Do not provide feedback on correct code.');
            sections.push('Be specific about line numbers and provide actionable suggestions.');
            prompt = sections.join('\n');
        }
        // Log the prompt for debugging
        this.logger.logPrompt('review', prompt);
        return prompt;
    }
    /**
     * Parse Gemini response into ReviewResult
     */
    parseReviewResponse(content) {
        try {
            // Clean the content first - remove dotenv messages and other noise
            const cleanedContent = this.cleanGeminiOutput(content);
            // Extract JSON from the cleaned content
            const jsonMatch = cleanedContent.match(/{[\s\S]*}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            const jsonStr = jsonMatch[0];
            // Try to parse with fallback handling
            const parseResult = this.parseJsonWithFallback(jsonStr);
            if (parseResult.success && parseResult.data) {
                const parsed = parseResult.data;
                // Validate the structure
                if (!parsed.findings || !Array.isArray(parsed.findings)) {
                    throw new Error('Invalid response structure: missing findings array');
                }
                return {
                    findings: parsed.findings,
                    summary: parsed.summary || 'No summary provided'
                };
            }
            else {
                // JSON parsing failed, try to extract partial findings
                this.logger.warn(`JSON parsing failed: ${parseResult.error}. Attempting to extract partial findings.`);
                const partialFindings = this.extractPartialFindings(jsonStr);
                if (partialFindings.length > 0) {
                    this.logger.info(`Successfully extracted ${partialFindings.length} findings from incomplete response`);
                    return {
                        findings: partialFindings,
                        summary: 'Partial review completed (response was incomplete)'
                    };
                }
                else {
                    throw new Error(`Failed to parse review response: ${parseResult.error}`);
                }
            }
        }
        catch (error) {
            this.logger.error('Failed to parse Gemini response:', error);
            throw new Error(`Failed to parse review response: ${error.message}`);
        }
    }
    /**
     * Clean Gemini CLI output by removing dotenv messages and other noise
     */
    cleanGeminiOutput(content) {
        // Remove common CLI noise and formatting
        return content
            // Remove dotenv messages that appear at the beginning
            .replace(/^\[dotenv@[^\]]+\]\s+injecting\s+env\s+\([^)]+\)\s+from\s+\.env\s*/gm, '')
            // Remove other dotenv-related messages
            .replace(/^\[dotenv[^\]]*\][^\n]*\n?/gm, '')
            // Remove ```json markers
            .replace(/^\s*```json\s*/gm, '')
            // Remove closing ``` markers
            .replace(/\s*```\s*$/gm, '')
            // Remove any other ``` markers
            .replace(/^\s*```\s*/gm, '')
            // Remove intro text
            .replace(/^\s*Here's the review.*$/gm, '')
            // Remove analysis text
            .replace(/^\s*Based on.*$/gm, '')
            // Remove any leading/trailing whitespace
            .trim();
    }
    /**
     * Parse JSON with fallback handling for incomplete responses
     */
    parseJsonWithFallback(jsonStr) {
        try {
            // First attempt: try to parse as-is
            const parsed = JSON.parse(jsonStr);
            return { success: true, data: parsed };
        }
        catch (error) {
            const errorMessage = error.message;
            // Try to fix common JSON escaping issues
            try {
                const fixedJsonStr = this.fixJsonEscaping(jsonStr);
                const parsed = JSON.parse(fixedJsonStr);
                return { success: true, data: parsed };
            }
            catch (fixError) {
                // If it's an "Unterminated string" or similar error, the JSON might be truncated
                if (errorMessage.includes('Unterminated string') ||
                    errorMessage.includes('Unexpected end of JSON input') ||
                    errorMessage.includes('Expected property name')) {
                    return { success: false, error: `Incomplete JSON response: ${errorMessage}` };
                }
                return { success: false, error: errorMessage };
            }
        }
    }
    /**
     * Extract partial findings from incomplete JSON
     */
    extractPartialFindings(jsonStr) {
        const findings = [];
        try {
            // Look for complete finding objects in the incomplete JSON
            // Use regex to find individual finding objects that are complete
            const findingPattern = /\{\s*"file":\s*"([^"]+)"[^}]*"line":\s*(\d+)[^}]*"severity":\s*"(error|warning|info)"[^}]*"message":\s*"([^"]+)"[^}]*\}/g;
            let match;
            while ((match = findingPattern.exec(jsonStr)) !== null) {
                const [, file, lineStr, severity, message] = match;
                // Validate required fields
                if (!file || !lineStr || !severity || !message) {
                    continue;
                }
                // Try to extract additional fields from the full match
                const fullMatch = match[0];
                const endLineMatch = fullMatch.match(/"endLine":\s*(\d+)/);
                const suggestionMatch = fullMatch.match(/"suggestion":\s*"([^"]+)"/);
                const ruleIdMatch = fullMatch.match(/"ruleId":\s*"([^"]+)"/);
                const categoryMatch = fullMatch.match(/"category":\s*"([^"]+)"/);
                const finding = {
                    file,
                    line: parseInt(lineStr, 10),
                    severity: severity,
                    message
                };
                if (endLineMatch && endLineMatch[1]) {
                    finding.endLine = parseInt(endLineMatch[1], 10);
                }
                if (suggestionMatch && suggestionMatch[1]) {
                    finding.suggestion = suggestionMatch[1];
                }
                if (ruleIdMatch && ruleIdMatch[1]) {
                    finding.ruleId = ruleIdMatch[1];
                }
                if (categoryMatch && categoryMatch[1]) {
                    finding.category = categoryMatch[1];
                }
                findings.push(finding);
            }
            this.logger.debug(`Extracted ${findings.length} partial findings from incomplete JSON`);
        }
        catch (error) {
            this.logger.warn(`Failed to extract partial findings: ${error.message}`);
        }
        return findings;
    }
    fixJsonEscaping(jsonStr) {
        // Fix common JSON escaping issues in Gemini responses
        let fixed = jsonStr;
        try {
            // First attempt: try to parse as-is
            JSON.parse(fixed);
            return fixed;
        }
        catch (error) {
            // If parsing fails, try a more aggressive approach
            // Parse the JSON structure manually and fix string values
            // Find all string values that contain unescaped quotes
            // This regex finds: "key": "value with potential issues"
            fixed = fixed.replace(/"(\w+)":\s*"((?:[^"\\]|\\.)*)"(?=\s*[,}])/g, (match, key, value) => {
                // Skip if the value is already properly escaped
                try {
                    JSON.parse(`{"${key}": "${value}"}`);
                    return match; // Already valid, don't change
                }
                catch {
                    // Fix the value by properly escaping it
                    const escapedValue = value
                        .replace(/\\/g, '\\\\') // Escape backslashes first
                        .replace(/"/g, '\\"') // Escape quotes
                        .replace(/\n/g, '\\n') // Escape newlines
                        .replace(/\r/g, '\\r') // Escape carriage returns
                        .replace(/\t/g, '\\t') // Escape tabs
                        .replace(/\f/g, '\\f') // Escape form feeds
                        .replace(/\b/g, '\\b'); // Escape backspaces
                    return `"${key}": "${escapedValue}"`;
                }
            });
            return fixed;
        }
    }
    /**
     * Apply custom prompt template with context data
     */
    applyCustomTemplate(context, template) {
        let result = template;
        // Replace placeholders with actual context data
        result = result.replace(/\{\{PROJECT_GUIDELINES\}\}/g, context.projectGuidelines || '');
        result = result.replace(/\{\{REVIEW_RULES\}\}/g, context.reviewRules || '');
        result = result.replace(/\{\{DIFFS\}\}/g, context.diffs || '');
        // Add default JSON format instructions if not present in template
        const jsonInstructions = `Please provide your response in the following JSON format:
\`\`\`json
{
  "findings": [
    {
      "file": "path/to/file",
      "line": 123,
      "endLine": 125,
      "severity": "warning",
      "message": "Issue description",
      "suggestion": "Suggested fix",
      "ruleId": "rule-id",
      "category": "category-name"
    }
  ],
  "summary": "Overall review summary"
}
\`\`\``;
        result = result.replace(/\{\{INSTRUCTIONS\}\}/g, jsonInstructions);
        // Clean up any remaining empty placeholders
        result = result.replace(/\{\{[^}]+\}\}/g, '');
        return result;
    }
    /**
     * Generate unique request ID
     */
    generateRequestId() {
        return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * Ensure temp directory exists
     */
    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }
    /**
     * Clean up temp directory
     */
    cleanup() {
        try {
            if (fs.existsSync(this.tempDir)) {
                fs.rmSync(this.tempDir, { recursive: true, force: true });
            }
        }
        catch (error) {
            this.logger.warn(`Failed to clean up temp directory: ${error.message}`);
        }
    }
    /**
     * Test Gemini CLI connection
     */
    async testConnection() {
        try {
            this.logger.debug('Testing Gemini CLI connection');
            const testPrompt = 'Hello, please respond with "OK"';
            const result = await this.executeGeminiCommandWithStdin(testPrompt, 10000);
            return result.stdout.includes('OK') || result.stdout.length > 0;
        }
        catch (error) {
            this.logger.debug(`Gemini CLI test failed: ${error.message}`);
            return false;
        }
    }
    /**
     * Get available models (placeholder - Gemini CLI doesn't support listing models)
     */
    async getAvailableModels() {
        try {
            const configPath = path.join(__dirname, '..', 'config', 'defaults.yaml');
            const configContent = fs.readFileSync(configPath, 'utf8');
            const config = yaml.load(configContent);
            if (config?.gemini?.availableModels && Array.isArray(config.gemini.availableModels)) {
                return config.gemini.availableModels;
            }
            // Fallback to hardcoded list if config is not available
            this.logger.warn('Could not load available models from config, using fallback list');
            return [
                'gemini-pro',
                'gemini-pro-vision',
                'gemini-1.5-pro',
                'gemini-1.5-flash'
            ];
        }
        catch (error) {
            this.logger.warn(`Error loading config file: ${error}. Using fallback model list.`);
            return [
                'gemini-pro',
                'gemini-pro-vision',
                'gemini-1.5-pro',
                'gemini-1.5-flash'
            ];
        }
    }
    /**
     * Get adapter summary
     */
    getSummary() {
        return `Gemini CLI adapter (temp dir: ${this.tempDir})`;
    }
}
exports.GeminiAdapter = GeminiAdapter;
//# sourceMappingURL=geminiAdapter.js.map