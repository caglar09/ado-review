"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenRouterAdapter = void 0;
const axios_1 = __importDefault(require("axios"));
class OpenRouterAdapter {
    logger;
    errorHandler;
    defaultTimeout;
    baseUrl;
    constructor(logger, errorHandler, defaultTimeout = 120000, baseUrl = 'https://openrouter.ai/api/v1') {
        this.logger = logger;
        this.errorHandler = errorHandler;
        this.defaultTimeout = defaultTimeout;
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }
    async reviewCode(context, config) {
        const apiKey = process.env['OPENROUTER_API_KEY'];
        if (!apiKey) {
            throw this.errorHandler.createUserError('Missing OPENROUTER_API_KEY environment variable for OpenRouter provider');
        }
        const prompt = this.buildReviewPrompt(context);
        const maxRetries = config.retryAttempts ?? 3;
        const baseDelay = config.retryDelay ?? 1000;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const url = `${this.baseUrl}/chat/completions`;
                const timeout = config.timeout ?? this.defaultTimeout;
                const response = await axios_1.default.post(url, {
                    model: config.model, // e.g., 'openai/gpt-4o-mini' or any OpenRouter alias
                    messages: [
                        { role: 'system', content: 'You are an expert code reviewer. Respond ONLY with JSON as instructed.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: config.temperature ?? 0.1,
                    max_tokens: config.maxTokens ?? undefined
                }, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        // Optional but recommended headers per OpenRouter docs
                        ...(process.env['OPENROUTER_REFERER'] ? { 'HTTP-Referer': process.env['OPENROUTER_REFERER'] } : {}),
                        ...(process.env['OPENROUTER_TITLE'] ? { 'X-Title': process.env['OPENROUTER_TITLE'] } : {})
                    },
                    timeout
                });
                const content = response.data?.choices?.[0]?.message?.content;
                if (!content) {
                    throw new Error('Empty response content from OpenRouter');
                }
                // Log raw response for debugging
                this.logger.logGeminiResponse('openrouter', JSON.stringify(response.data));
                return this.parseReviewResponse(content);
            }
            catch (err) {
                const error = err;
                const status = error.response?.status;
                const message = error.response?.data ? JSON.stringify(error.response.data) : error.message;
                this.logger.warn(`OpenRouter request failed (attempt ${attempt}/${maxRetries}): ${status || ''} ${message}`);
                if (attempt === maxRetries) {
                    throw this.errorHandler.createAPIError('OpenRouter request failed', status, error.response?.data, { metadata: { message } });
                }
                const isRateLimit = status === 429;
                const delay = this.calculateBackoffDelay(attempt, baseDelay, isRateLimit);
                await this.sleep(delay);
            }
        }
        throw this.errorHandler.createInternalError('OpenRouter retry loop exhausted unexpectedly');
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    calculateBackoffDelay(attempt, baseDelay, rateLimited) {
        const multiplier = rateLimited ? 2 : 1.5;
        const maxDelay = rateLimited ? 60000 : 30000;
        let delay = baseDelay * Math.pow(multiplier, attempt - 1);
        delay = Math.min(delay, maxDelay);
        const jitter = delay * 0.25 * (Math.random() - 0.5);
        return Math.max(baseDelay, Math.floor(delay + jitter));
    }
    buildReviewPrompt(context) {
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
        sections.push('Only return the raw JSON. Do not include any additional text.');
        sections.push('Be specific about line numbers and provide actionable suggestions.');
        const prompt = sections.join('\n');
        this.logger.logPrompt('openrouter', prompt);
        return prompt;
    }
    parseReviewResponse(content) {
        const cleaned = content
            .replace(/^\s*```json\s*/gm, '')
            .replace(/^\s*```\s*/gm, '')
            .trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw this.errorHandler.createAPIError('OpenRouter returned non-JSON response', undefined, undefined, { metadata: { preview: cleaned.slice(0, 200) } });
        }
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (!parsed.findings || !Array.isArray(parsed.findings)) {
                throw new Error('Invalid response structure: missing findings array');
            }
            return { findings: parsed.findings, summary: parsed.summary || 'No summary provided' };
        }
        catch (e) {
            throw this.errorHandler.createInternalError('Failed to parse OpenRouter response JSON', { metadata: { error: e.message } });
        }
    }
}
exports.OpenRouterAdapter = OpenRouterAdapter;
//# sourceMappingURL=openRouterAdapter.js.map