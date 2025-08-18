export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export interface LoggerOptions {
    level?: LogLevel;
    logFile?: string;
    enableConsole?: boolean;
    enableFile?: boolean;
    maskSecrets?: boolean;
    workspaceDir?: string;
}
export declare class Logger {
    private winston;
    private maskSecrets;
    private secretPatterns;
    private workspaceDir;
    constructor(options?: LoggerOptions);
    /**
     * Set log level
     */
    setLevel(level: LogLevel): void;
    /**
     * Get current log level
     */
    getLevel(): string;
    /**
     * Log error message
     */
    error(message: string, meta?: any): void;
    /**
     * Log warning message
     */
    warn(message: string, meta?: any): void;
    /**
     * Log info message
     */
    info(message: string, meta?: any): void;
    /**
     * Log debug message
     */
    debug(message: string, meta?: any): void;
    /**
     * Log step with progress indicator
     */
    step(step: number, total: number, message: string): void;
    /**
     * Log success message
     */
    success(message: string): void;
    /**
     * Log failure message
     */
    failure(message: string): void;
    /**
     * Log warning with icon
     */
    warning(message: string): void;
    /**
     * Create a child logger with additional context
     */
    child(context: Record<string, any>): Logger;
    /**
     * Colorize log level for console output
     */
    private colorizeLevel;
    /**
     * Mask secrets in text
     */
    private maskSecretsInText;
    /**
     * Create a timer for measuring operation duration
     */
    timer(label: string): () => void;
    /**
     * Log table data
     */
    table(data: any[], options?: {
        headers?: string[];
    }): void;
    /**
     * Log diff data to file
     */
    logDiff(prId: string, diffData: string): void;
    /**
     * Log Gemini prompt to file
     */
    logPrompt(prId: string, promptData: string, batchIndex?: number): void;
    /**
     * Log Gemini response to file
     */
    logGeminiResponse(prId: string, responseData: string, batchIndex?: number): void;
    /**
     * Close logger and flush any pending writes
     */
    close(): Promise<void>;
}
//# sourceMappingURL=logger.d.ts.map