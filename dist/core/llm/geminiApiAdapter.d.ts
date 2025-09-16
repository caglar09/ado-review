import { Logger } from '../logger';
import { ErrorHandler } from '../errorHandler';
import { ReviewContext } from '../contextBuilder';
import { LLMAdapter, LLMConfig, ReviewResult } from './types';
export declare class GeminiApiAdapter implements LLMAdapter {
    private logger;
    private errorHandler;
    private defaultTimeout;
    private baseUrl;
    constructor(logger: Logger, errorHandler: ErrorHandler, defaultTimeout?: number, baseUrl?: string);
    reviewCode(context: ReviewContext, config: LLMConfig): Promise<ReviewResult>;
    private sleep;
    private calculateBackoffDelay;
    private buildReviewPrompt;
    private parseReviewResponse;
}
//# sourceMappingURL=geminiApiAdapter.d.ts.map