import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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

export class GeminiAdapter {
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private tempDir: string;
  private defaultTimeout: number;

  constructor(logger: Logger, errorHandler: ErrorHandler, defaultTimeout: number = 30000) {
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
  public async reviewCode(
    context: ReviewContext,
    config: GeminiConfig
  ): Promise<ReviewResult> {
    try {
      this.logger.info(`Starting Gemini review with model: ${config.model}`);
      
      const requestId = this.generateRequestId();
      const prompt = this.buildReviewPrompt(context);
      
      const request: GeminiRequest = {
        prompt,
        config,
        requestId
      };
      
      const response = await this.callGemini(request);
      
      if (response.error) {
        throw new Error(`Gemini API error: ${response.error}`);
      }
      
      const result = this.parseReviewResponse(response.content);
      
      this.logger.info(`Review completed: ${result.findings.length} findings`);
      return result;
    } catch (error) {
      this.logger.error(`Error in reviewCode: ${(error as Error).message}`);
      throw this.errorHandler.createInternalError(`Review failed: ${(error as Error).message}`);
    }
  }

  /**
   * Call Gemini CLI with the given request
   */
  private async callGemini(request: GeminiRequest): Promise<GeminiResponse> {
    const { prompt, config, requestId } = request;
    
    try {
      const timeout = config.timeout || this.defaultTimeout;
      const result = await this.executeGeminiCommandWithStdin(prompt, timeout);
      
      const response: GeminiResponse = {
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
    } catch (error) {
      this.logger.error(`Error when talking to Gemini API: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Execute Gemini CLI command with stdin approach
   */
  private async executeGeminiCommandWithStdin(
    prompt: string,
    timeout: number
  ): Promise<{
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve, reject) => {
      this.logger.debug('Spawning Gemini CLI with stdin approach');
      
      const child: ChildProcess = spawn('gemini', [], {
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
            stdout: stdout.trim(),
            stderr: stderr.trim()
          });
        } else {
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
  private extractUsageInfo(output: string): {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | undefined {
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
    } catch (error) {
      this.logger.debug(`Failed to extract usage info: ${(error as Error).message}`);
    }
    
    return undefined;
  }

  /**
   * Extract finish reason from Gemini CLI output
   */
  private extractFinishReason(output: string): string | undefined {
    const finishReasonMatch = output.match(/finish[_\s]reason[:\s]+([a-zA-Z_]+)/i);
    return finishReasonMatch ? finishReasonMatch[1] : undefined;
  }

  /**
   * Build review prompt from context
   */
  private buildReviewPrompt(context: ReviewContext): string {
    let prompt: string;
    
    // Use custom prompt template if provided
    if (context.customPromptTemplate) {
      prompt = this.applyCustomTemplate(context, context.customPromptTemplate);
    } else {
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
  private parseReviewResponse(content: string): ReviewResult {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/{[\s\S]*}/);
      
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        
        const findings = this.validateFindings(parsed.findings || []);
        const metadata = {
          reviewedFiles: new Set(findings.map(f => f.file)).size,
          reviewedLines: findings.reduce((sum, f) => sum + (f.endLine ? f.endLine - f.line + 1 : 1), 0),
          totalIssues: findings.length,
          issuesBySeverity: this.groupBySeverity(findings)
        };
        
        return {
          findings,
          summary: parsed.summary || 'Review completed',
          metadata
        };
      } else {
        // Fallback to text parsing
        return this.parseTextResponse(content);
      }
    } catch (error) {
      this.logger.warn(`Failed to parse JSON response: ${(error as Error).message}`);
      this.logger.debug(`Response content: ${content}`);
      return this.parseTextResponse(content);
    }
  }

  /**
   * Validate and normalize findings
   */
  private validateFindings(findings: any[]): ReviewFinding[] {
    const validated: ReviewFinding[] = [];
    
    for (const finding of findings) {
      if (!finding.file || !finding.message) {
        this.logger.warn('Skipping invalid finding: missing file or message');
        continue;
      }
      
      if (typeof finding.line !== 'number' || finding.line < 1) {
        this.logger.warn('Skipping invalid finding: invalid line number');
        continue;
      }
      
      const validatedFinding: ReviewFinding = {
        file: String(finding.file),
        line: Number(finding.line),
        severity: this.normalizeSeverity(finding.severity),
        message: String(finding.message)
      };
      
      if (finding.endLine) {
        validatedFinding.endLine = Number(finding.endLine);
      }
      
      if (finding.suggestion) {
        validatedFinding.suggestion = String(finding.suggestion);
      }
      
      if (finding.ruleId) {
        validatedFinding.ruleId = String(finding.ruleId);
      }
      
      if (finding.category) {
        validatedFinding.category = String(finding.category);
      }
      
      validated.push(validatedFinding);
    }
    
    return validated;
  }

  /**
   * Normalize severity to valid values
   */
  private normalizeSeverity(severity: any): 'error' | 'warning' | 'info' {
    if (typeof severity === 'string') {
      const lower = severity.toLowerCase();
      if (lower === 'error' || lower === 'critical') return 'error';
      if (lower === 'warning' || lower === 'warn') return 'warning';
      if (lower === 'info' || lower === 'information') return 'info';
    }
    return 'warning'; // Default
  }

  /**
   * Group findings by severity
   */
  private groupBySeverity(findings: ReviewFinding[]): Record<string, number> {
    const groups: Record<string, number> = {
      error: 0,
      warning: 0,
      info: 0
    };
    
    for (const finding of findings) {
         if (finding?.severity) {
           groups[finding.severity] = (groups[finding.severity] || 0) + 1;
         }
       }
    
    return groups;
  }

  /**
   * Apply custom prompt template with context data
   */
  private applyCustomTemplate(context: ReviewContext, template: string): string {
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
   * Parse response as plain text (fallback)
   */
  private parseTextResponse(content: string): ReviewResult {
    this.logger.debug('Parsing response as plain text');
    
    // Simple text parsing - look for common patterns
    const findings: ReviewFinding[] = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        const lineContent = lines[i];
        if (lineContent) {
          const line = lineContent.trim();
          if (line && (line.includes('ERROR:') || line.includes('WARNING:') || line.includes('INFO:'))) {
            findings.push({
              file: 'unknown',
              line: 1,
              severity: line.includes('ERROR:') ? 'error' : line.includes('WARNING:') ? 'warning' : 'info',
              message: line
            });
          }
        }
      }
    
    const metadata = {
      reviewedFiles: new Set(findings.map(f => f.file)).size,
      reviewedLines: findings.reduce((sum, f) => sum + (f.endLine ? f.endLine - f.line + 1 : 1), 0),
      totalIssues: findings.length,
      issuesBySeverity: this.groupBySeverity(findings)
    };

    return {
      findings,
      summary: 'Parsed from text response',
      metadata
    };
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Ensure temp directory exists
   */
  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Clean up temp directory
   */
  public cleanup(): void {
    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      this.logger.warn(`Failed to clean up temp directory: ${(error as Error).message}`);
    }
  }

  /**
   * Test Gemini CLI connection
   */
  public async testConnection(): Promise<boolean> {
    try {
      this.logger.debug('Testing Gemini CLI connection');
      
      const testPrompt = 'Hello, please respond with "OK"';
      const result = await this.executeGeminiCommandWithStdin(testPrompt, 10000);
      
      return result.stdout.includes('OK') || result.stdout.length > 0;
    } catch (error) {
      this.logger.debug(`Gemini CLI test failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Get available models (placeholder - Gemini CLI doesn't support listing models)
   */
  public async getAvailableModels(): Promise<string[]> {
    // Gemini CLI doesn't provide a way to list models
    // Return common Gemini model names
    return [
      'gemini-pro',
      'gemini-pro-vision',
      'gemini-1.5-pro',
      'gemini-1.5-flash'
    ];
  }

  /**
   * Get adapter summary
   */
  public getSummary(): string {
    return `Gemini CLI adapter (temp dir: ${this.tempDir})`;
  }
}