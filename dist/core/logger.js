"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const winston_1 = __importDefault(require("winston"));
const chalk_1 = __importDefault(require("chalk"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class Logger {
    constructor(options = {}) {
        this.maskSecrets = options.maskSecrets ?? true;
        this.workspaceDir = options.workspaceDir;
        this.secretPatterns = [
            /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
            /token["']?\s*[:=]\s*["']?[A-Za-z0-9\-._~+/]+=*["']?/gi,
            /api[_-]?key["']?\s*[:=]\s*["']?[A-Za-z0-9\-._~+/]+=*["']?/gi,
            /password["']?\s*[:=]\s*["']?[^\s"']+["']?/gi,
            /secret["']?\s*[:=]\s*["']?[A-Za-z0-9\-._~+/]+=*["']?/gi
        ];
        const transports = [];
        // Console transport
        if (options.enableConsole !== false) {
            transports.push(new winston_1.default.transports.Console({
                format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'HH:mm:ss' }), winston_1.default.format.printf(({ level, message, timestamp }) => {
                    const coloredLevel = this.colorizeLevel(level);
                    const messageStr = String(message);
                    const maskedMessage = this.maskSecrets ? this.maskSecretsInText(messageStr) : messageStr;
                    return `${chalk_1.default.gray(timestamp)} ${coloredLevel} ${maskedMessage}`;
                }))
            }));
        }
        // File transport
        if (options.enableFile && options.logFile) {
            const logDir = path_1.default.dirname(options.logFile);
            if (!fs_1.default.existsSync(logDir)) {
                fs_1.default.mkdirSync(logDir, { recursive: true });
            }
            transports.push(new winston_1.default.transports.File({
                filename: options.logFile,
                format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json(), winston_1.default.format.printf(({ level, message, timestamp }) => {
                    const messageStr = String(message);
                    const maskedMessage = this.maskSecrets ? this.maskSecretsInText(messageStr) : messageStr;
                    return JSON.stringify({ timestamp, level, message: maskedMessage });
                }))
            }));
        }
        this.winston = winston_1.default.createLogger({
            level: options.level || 'info',
            transports
        });
    }
    /**
     * Set log level
     */
    setLevel(level) {
        this.winston.level = level;
    }
    /**
     * Get current log level
     */
    getLevel() {
        return this.winston.level;
    }
    /**
     * Log error message
     */
    error(message, meta) {
        this.winston.error(message, meta);
    }
    /**
     * Log warning message
     */
    warn(message, meta) {
        this.winston.warn(message, meta);
    }
    /**
     * Log info message
     */
    info(message, meta) {
        this.winston.info(message, meta);
    }
    /**
     * Log debug message
     */
    debug(message, meta) {
        this.winston.debug(message, meta);
    }
    /**
     * Log step with progress indicator
     */
    step(step, total, message) {
        const progress = `[${step}/${total}]`;
        this.info(`${chalk_1.default.blue(progress)} ${message}`);
    }
    /**
     * Log success message
     */
    success(message) {
        this.info(chalk_1.default.green(`✅ ${message}`));
    }
    /**
     * Log failure message
     */
    failure(message) {
        this.error(chalk_1.default.red(`❌ ${message}`));
    }
    /**
     * Log warning with icon
     */
    warning(message) {
        this.warn(chalk_1.default.yellow(`⚠️  ${message}`));
    }
    /**
     * Create a child logger with additional context
     */
    child(context) {
        const childWinston = this.winston.child(context);
        const childLogger = Object.create(this);
        childLogger.winston = childWinston;
        return childLogger;
    }
    /**
     * Colorize log level for console output
     */
    colorizeLevel(level) {
        switch (level) {
            case 'error':
                return chalk_1.default.red('ERROR');
            case 'warn':
                return chalk_1.default.yellow('WARN ');
            case 'info':
                return chalk_1.default.blue('INFO ');
            case 'debug':
                return chalk_1.default.gray('DEBUG');
            default:
                return level.toUpperCase();
        }
    }
    /**
     * Mask secrets in text
     */
    maskSecretsInText(text) {
        if (!this.maskSecrets) {
            return text;
        }
        let maskedText = text;
        for (const pattern of this.secretPatterns) {
            maskedText = maskedText.replace(pattern, (match) => {
                // Keep the first few characters and mask the rest
                const visibleChars = Math.min(4, Math.floor(match.length * 0.2));
                const maskedChars = '*'.repeat(Math.max(8, match.length - visibleChars));
                return match.substring(0, visibleChars) + maskedChars;
            });
        }
        return maskedText;
    }
    /**
     * Create a timer for measuring operation duration
     */
    timer(label) {
        const start = Date.now();
        return () => {
            const duration = Date.now() - start;
            this.debug(`${label} completed in ${duration}ms`);
        };
    }
    /**
     * Log table data
     */
    table(data, options) {
        if (data.length === 0) {
            this.info('No data to display');
            return;
        }
        // Simple table formatting for console
        const headers = options?.headers || Object.keys(data[0]);
        const rows = data.map(item => headers.map(header => String(item[header] || '')));
        // Calculate column widths
        const widths = headers.map((header, i) => Math.max(header.length, ...rows.map(row => row[i]?.length || 0)));
        // Format header
        const headerRow = headers.map((header, i) => header.padEnd(widths[i] || 0)).join(' | ');
        const separator = widths.map(width => '-'.repeat(width || 0)).join('-+-');
        this.info(headerRow);
        this.info(separator);
        // Format data rows
        rows.forEach(row => {
            const formattedRow = row.map((cell, i) => cell.padEnd(widths[i] || 0)).join(' | ');
            this.info(formattedRow);
        });
    }
    /**
     * Log diff data to file
     */
    logDiff(prId, diffData) {
        if (this.getLevel() === 'debug') {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `diff-pr-${prId}-${timestamp}.txt`;
            const baseDir = this.workspaceDir || process.cwd();
            const logDir = path_1.default.join(baseDir, 'logs', 'diffs');
            if (!fs_1.default.existsSync(logDir)) {
                fs_1.default.mkdirSync(logDir, { recursive: true });
            }
            const filePath = path_1.default.join(logDir, filename);
            fs_1.default.writeFileSync(filePath, diffData, 'utf-8');
            this.debug(`Diff data saved to: ${filePath}`);
        }
    }
    /**
     * Log Gemini prompt to file
     */
    logPrompt(prId, promptData, batchIndex) {
        if (this.getLevel() === 'debug') {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const batchSuffix = batchIndex !== undefined ? `-batch-${batchIndex}` : '';
            const filename = `prompt-pr-${prId}${batchSuffix}-${timestamp}.txt`;
            const baseDir = this.workspaceDir || process.cwd();
            const logDir = path_1.default.join(baseDir, 'logs', 'prompts');
            if (!fs_1.default.existsSync(logDir)) {
                fs_1.default.mkdirSync(logDir, { recursive: true });
            }
            const filePath = path_1.default.join(logDir, filename);
            fs_1.default.writeFileSync(filePath, promptData, 'utf-8');
            this.debug(`Prompt data saved to: ${filePath}`);
        }
    }
    /**
     * Log Gemini response to file
     */
    logGeminiResponse(prId, responseData, batchIndex) {
        if (this.getLevel() === 'debug') {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const batchSuffix = batchIndex !== undefined ? `-batch-${batchIndex}` : '';
            const filename = `gemini-response-pr-${prId}${batchSuffix}-${timestamp}.json`;
            const baseDir = this.workspaceDir || process.cwd();
            const logDir = path_1.default.join(baseDir, 'logs', 'responses');
            if (!fs_1.default.existsSync(logDir)) {
                fs_1.default.mkdirSync(logDir, { recursive: true });
            }
            const filePath = path_1.default.join(logDir, filename);
            // Try to format as JSON if possible, otherwise save as text
            try {
                const jsonData = JSON.parse(responseData);
                fs_1.default.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');
            }
            catch {
                fs_1.default.writeFileSync(filePath, responseData, 'utf-8');
            }
            this.debug(`Gemini response saved to: ${filePath}`);
        }
    }
    /**
     * Close logger and flush any pending writes
     */
    close() {
        return new Promise((resolve) => {
            if (this.winston.close) {
                this.winston.close();
            }
            resolve();
        });
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map