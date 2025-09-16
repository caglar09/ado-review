import { Logger } from './logger';
import { ErrorHandler } from './errorHandler';
import { ReviewContext } from './contextBuilder';
import { LLMAdapter, LLMConfig, ReviewResult } from './llm/types';
export interface GeminiConfig {
    model: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    timeout?: number;
    retryAttempts?: number;
    retryDelay?: number;
    maxBackoffDelay?: number;
    enableRateLimitHandling?: boolean;
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
export declare class GeminiAdapter implements LLMAdapter {
    private logger;
    private errorHandler;
    private tempDir;
    private defaultTimeout;
    constructor(logger: Logger, errorHandler: ErrorHandler, defaultTimeout?: number);
    /**
     * Review code using Gemini
     */
    reviewCode(context: ReviewContext, config: LLMConfig): Promise<ReviewResult>;
    /**
     * Call Gemini CLI with the given request
     */
    private callGemini;
    /**
     * Check if error is a rate limit error (429)
     */
    private isRateLimitError;
    /**
     * Calculate exponential backoff delay with jitter
     */
    private calculateBackoffDelay;
    /**
     * Sleep for specified milliseconds
     */
    private sleep;
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
     * Clean Gemini CLI output by removing dotenv messages and other noise
     */
    private cleanGeminiOutput;
    /**
     * Parse JSON with fallback handling for incomplete responses
     */
    private parseJsonWithFallback;
    /**
     * Extract partial findings from incomplete JSON
     */
    private extractPartialFindings;
    private fixJsonEscaping;
    /**
     * Apply custom prompt template with context data
     */
    private applyCustomTemplate;
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