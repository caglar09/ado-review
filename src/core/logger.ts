import winston from 'winston';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LoggerOptions {
  level?: LogLevel;
  logFile?: string;
  enableConsole?: boolean;
  enableFile?: boolean;
  maskSecrets?: boolean;
  workspaceDir?: string;
}

export class Logger {
  private winston: winston.Logger;
  private maskSecrets: boolean;
  private secretPatterns: RegExp[];
  private workspaceDir: string | undefined;

  constructor(options: LoggerOptions = {}) {
    this.maskSecrets = options.maskSecrets ?? true;
    this.workspaceDir = options.workspaceDir;
    this.secretPatterns = [
      /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
      /token["']?\s*[:=]\s*["']?[A-Za-z0-9\-._~+/]+=*["']?/gi,
      /api[_-]?key["']?\s*[:=]\s*["']?[A-Za-z0-9\-._~+/]+=*["']?/gi,
      /password["']?\s*[:=]\s*["']?[^\s"']+["']?/gi,
      /secret["']?\s*[:=]\s*["']?[A-Za-z0-9\-._~+/]+=*["']?/gi
    ];

    const transports: winston.transport[] = [];

    // Console transport
    if (options.enableConsole !== false) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp({ format: 'HH:mm:ss' }),
            winston.format.printf(({ level, message, timestamp }) => {
              const coloredLevel = this.colorizeLevel(level);
              const messageStr = String(message);
              const maskedMessage = this.maskSecrets ? this.maskSecretsInText(messageStr) : messageStr;
              return `${chalk.gray(timestamp)} ${coloredLevel} ${maskedMessage}`;
            })
          )
        })
      );
    }

    // File transport
    if (options.enableFile && options.logFile) {
      const logDir = path.dirname(options.logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      transports.push(
        new winston.transports.File({
          filename: options.logFile,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
            winston.format.printf(({ level, message, timestamp }) => {
              const messageStr = String(message);
              const maskedMessage = this.maskSecrets ? this.maskSecretsInText(messageStr) : messageStr;
              return JSON.stringify({ timestamp, level, message: maskedMessage });
            })
          )
        })
      );
    }

    this.winston = winston.createLogger({
      level: options.level || 'info',
      transports
    });
  }

  /**
   * Set log level
   */
  public setLevel(level: LogLevel): void {
    this.winston.level = level;
  }

  /**
   * Get current log level
   */
  public getLevel(): string {
    return this.winston.level;
  }

  /**
   * Log error message
   */
  public error(message: string, meta?: any): void {
    this.winston.error(message, meta);
  }

  /**
   * Log warning message
   */
  public warn(message: string, meta?: any): void {
    this.winston.warn(message, meta);
  }

  /**
   * Log info message
   */
  public info(message: string, meta?: any): void {
    this.winston.info(message, meta);
  }

  /**
   * Log debug message
   */
  public debug(message: string, meta?: any): void {
    this.winston.debug(message, meta);
  }

  /**
   * Log step with progress indicator
   */
  public step(step: number, total: number, message: string): void {
    const progress = `[${step}/${total}]`;
    this.info(`${chalk.blue(progress)} ${message}`);
  }

  /**
   * Log success message
   */
  public success(message: string): void {
    this.info(chalk.green(`✅ ${message}`));
  }

  /**
   * Log failure message
   */
  public failure(message: string): void {
    this.error(chalk.red(`❌ ${message}`));
  }

  /**
   * Log warning with icon
   */
  public warning(message: string): void {
    this.warn(chalk.yellow(`⚠️  ${message}`));
  }

  /**
   * Create a child logger with additional context
   */
  public child(context: Record<string, any>): Logger {
    const childWinston = this.winston.child(context);
    const childLogger = Object.create(this);
    childLogger.winston = childWinston;
    return childLogger;
  }

  /**
   * Colorize log level for console output
   */
  private colorizeLevel(level: string): string {
    switch (level) {
      case 'error':
        return chalk.red('ERROR');
      case 'warn':
        return chalk.yellow('WARN ');
      case 'info':
        return chalk.blue('INFO ');
      case 'debug':
        return chalk.gray('DEBUG');
      default:
        return level.toUpperCase();
    }
  }

  /**
   * Mask secrets in text
   */
  private maskSecretsInText(text: string): string {
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
  public timer(label: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.debug(`${label} completed in ${duration}ms`);
    };
  }

  /**
   * Log table data
   */
  public table(data: any[], options?: { headers?: string[] }): void {
    if (data.length === 0) {
      this.info('No data to display');
      return;
    }

    // Simple table formatting for console
    const headers = options?.headers || Object.keys(data[0]);
    const rows = data.map(item => headers.map(header => String(item[header] || '')));
    
    // Calculate column widths
    const widths = headers.map((header, i) => 
      Math.max(header.length, ...rows.map(row => row[i]?.length || 0))
    );

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
  public logDiff(prId: string, diffData: string): void {
    if (this.getLevel() === 'debug') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `diff-pr-${prId}-${timestamp}.txt`;
      const baseDir = this.workspaceDir || process.cwd();
      const logDir = path.join(baseDir, 'logs', 'diffs');
      
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      const filePath = path.join(logDir, filename);
      fs.writeFileSync(filePath, diffData, 'utf-8');
      this.debug(`Diff data saved to: ${filePath}`);
    }
  }

  /**
   * Log Gemini prompt to file
   */
  public logPrompt(prId: string, promptData: string, batchIndex?: number): void {
    if (this.getLevel() === 'debug') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const batchSuffix = batchIndex !== undefined ? `-batch-${batchIndex}` : '';
      const filename = `prompt-pr-${prId}${batchSuffix}-${timestamp}.txt`;
      const baseDir = this.workspaceDir || process.cwd();
      const logDir = path.join(baseDir, 'logs', 'prompts');
      
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      const filePath = path.join(logDir, filename);
      fs.writeFileSync(filePath, promptData, 'utf-8');
      this.debug(`Prompt data saved to: ${filePath}`);
    }
  }

  /**
   * Log Gemini response to file
   */
  public logGeminiResponse(prId: string, responseData: string, batchIndex?: number): void {
    if (this.getLevel() === 'debug') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const batchSuffix = batchIndex !== undefined ? `-batch-${batchIndex}` : '';
      const filename = `gemini-response-pr-${prId}${batchSuffix}-${timestamp}.json`;
      const baseDir = this.workspaceDir || process.cwd();
      const logDir = path.join(baseDir, 'logs', 'responses');
      
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      const filePath = path.join(logDir, filename);
      
      // Try to format as JSON if possible, otherwise save as text
      try {
        const jsonData = JSON.parse(responseData);
        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');
      } catch {
        fs.writeFileSync(filePath, responseData, 'utf-8');
      }
      
      this.debug(`Gemini response saved to: ${filePath}`);
    }
  }

  /**
   * Close logger and flush any pending writes
   */
  public close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.winston.close) {
        this.winston.close();
      }
      resolve();
    });
  }
}