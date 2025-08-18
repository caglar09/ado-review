import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';
import { ReviewContext } from './contextBuilder';
export interface GeminiConfig {
    model: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    timeout?: number;
    retryAttempts?: number;
    retryDelay?: number;
}
export interface GeminiRequest {
    prompt: string;
    config: GeminiConfig;
    requestId: string;
}
export interface GeminiResponse {
    requestId: string;
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    model: string;
    finishReason?: string;
    error?: string;
}
export interface ReviewFinding {
    file: string;
    line: number;
    endLine?: number;
    severity: 'error' | 'warning' | 'info';
    message: string;
    suggestion?: string;
    ruleId?: string;
    category?: string;
}
export interface ReviewResult {
    findings: ReviewFinding[];
    summary?: string;
    metadata?: {
        reviewedFiles: number;
        reviewedLines: number;
        totalIssues: number;
        issuesBySeverity: Record<string, number>;
    };
}
export declare class GeminiAdapter {
    private logger;
    private errorHandler;
    private tempDir;
    private defaultTimeout;
    constructor(logger: Logger, errorHandler: ErrorHandler, defaultTimeout?: number);
    /**
     * Review code using Gemini
     */
    reviewCode(context: ReviewContext, config: GeminiConfig): Promise<ReviewResult>;
    /**
     * Call Gemini CLI with the given request
     */
    private callGemini;
    /**
     * Execute Gemini CLI command with stdin approach
     */
    private executeGeminiCommandWithStdin;
    /**
     * Extract usage information from Gemini CLI output
     */
    private extractUsageInfo;
    /**
     * Extract finish reason from Gemini CLI output
     */
    private extractFinishReason;
    /**
     * Build review prompt from context
     */
    private buildReviewPrompt;
    /**
     * Parse Gemini response into ReviewResult
     */
    private parseReviewResponse;
    /**
     * Validate and normalize findings
     */
    private validateFindings;
    /**
     * Normalize severity to valid values
     */
    private normalizeSeverity;
    /**
     * Group findings by severity
     */
    private groupBySeverity;
    /**
     * Apply custom prompt template with context data
     */
    private applyCustomTemplate;
    /**
     * Parse response as plain text (fallback)
     */
    private parseTextResponse;
    /**
     * Generate unique request ID
     */
    private generateRequestId;
    /**
     * Ensure temp directory exists
     */
    private ensureTempDir;
    /**
     * Clean up temp directory
     */
    cleanup(): void;
    /**
     * Test Gemini CLI connection
     */
    testConnection(): Promise<boolean>;
    /**
     * Get available models (placeholder - Gemini CLI doesn't support listing models)
     */
    getAvailableModels(): Promise<string[]>;
    /**
     * Get adapter summary
     */
    getSummary(): string;
}
//# sourceMappingURL=geminiAdapter.d.ts.map