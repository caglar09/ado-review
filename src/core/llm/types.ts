import { ReviewContext } from '../contextBuilder';

export type Severity = 'error' | 'warning' | 'info';

export interface ReviewFinding {
  file: string;
  line: number;
  endLine?: number;
  severity: Severity;
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

export interface LLMConfig {
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

export interface LLMAdapter {
  reviewCode(context: ReviewContext, config: LLMConfig): Promise<ReviewResult>;
  getAvailableModels?(): Promise<string[]>;
  getSummary?(): string;
}

