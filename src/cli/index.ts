#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import path, { join } from 'path';
import { readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { Logger } from '../core/logger.js';
import { ErrorHandler } from '../core/errorHandler.js';
import { ReviewOrchestrator } from '../core/reviewOrchestrator.js';
import { ConfigLoader } from '../core/configLoader.js';

const program = new Command();
// Initialize logger with basic settings first, will be reconfigured after loading config
const logger = new Logger();
const errorHandler = new ErrorHandler(logger);
const configLoader = new ConfigLoader(logger, errorHandler);

// Functions to get defaults from config
function getDefaultProviderFromConfig(): 'gemini-api' | 'openai' | 'openrouter' {
  try {
    const configPath = join(__dirname, '..', 'config', 'defaults.yaml');
    const configContent = readFileSync(configPath, 'utf8');
    const config = yaml.load(configContent) as any;
    if (config?.llm?.defaultProvider && ['gemini-api','openai','openrouter'].includes(config.llm.defaultProvider)) {
      return config.llm.defaultProvider;
    }
  } catch {}
  return 'gemini-api';
}

function getDefaultModelFromConfig(): string {
  try {
    const configPath = join(__dirname, '..', 'config', 'defaults.yaml');
    const configContent = readFileSync(configPath, 'utf8');
    const config = yaml.load(configContent) as any;
    const provider = config?.llm?.defaultProvider || 'gemini-api';
    if (provider === 'openai') {
      return (config?.openai?.defaultModel as string) || 'gpt-4o-mini';
    }
    if (provider === 'openrouter') {
      return (config?.openrouter?.defaultModel as string) || 'openai/gpt-4o-mini';
    }
    return (config?.gemini?.defaultModel as string) || 'gemini-pro';
  } catch (error) {
    return 'gemini-pro';
  }
}

// Read version from package.json
const packageJsonPath = join(__dirname, '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

// CLI version and description
program
  .name('ado-review')
  .description('Azure DevOps PR Review CLI - AI Agent supported CLI tool for automated Pull Request reviews')
  .version(packageJson.version);

// Main review command
program
  .command('review')
  .description('Review a Pull Request using AI-powered analysis')
  .option('--pr-url <url>', 'Azure DevOps Pull Request URL')
  .option('--pr <id>', 'Pull Request ID (requires --org, --project, --repo)')
  .option('--org <organization>', 'Azure DevOps organization name')
  .option('--project <project>', 'Azure DevOps project name')
  .option('--repo <repository>', 'Repository name')
  .option('--rules <paths...>', 'Paths to rule files (YAML/JSON/MD)', [])
  .option('--project-rules <path>', 'Path to project-specific rules file')
  .option('--custom-prompt-template <path>', 'Path to custom prompt template file')
  .option('--include <patterns...>', 'File patterns to include', [])
  .option('--exclude <patterns...>', 'File patterns to exclude', [])
  .option('--files <files...>', 'Specific files to review', [])
  .option('--all-files', 'Review all files (not just changed ones)', false)
  .option('--provider <name>', 'LLM provider (gemini-api|openai|openrouter)', getDefaultProviderFromConfig())
  .option('--model <name>', 'Model to use for selected provider', getDefaultModelFromConfig())
  .option('--max-context-tokens <number>', 'Maximum context tokens for LLM', parseInt, 32000)
  .option('--ratelimit-batch <number>', 'Batch size for rate limiting', parseInt, 5)
  .option('--ratelimit-sleep-ms <number>', 'Sleep time between batches (ms)', parseInt, 1000)
  .option('--tmp-dir <path>', 'Custom temporary directory path')
  .option('--keep-workdir', 'Keep temporary working directory after completion', false)
  .option('--post-status', 'Post PR status to Azure DevOps', false)
  .option('--auto-approve', 'Automatically approve and post all findings', false)
  .option('--dry-run', 'Show findings without posting to Azure DevOps', false)
  .option('--format <type>', 'Output format (table|json)', 'table')
  .option('--severity-threshold <level>', 'Minimum severity level to report (info|warning|error)', 'info')
  .option('--verbose', 'Enable verbose logging', false)
  .action(async (options) => {
    try {
      // Load configuration to get log level from ADO_REVIEW_LOG_LEVEL
      await configLoader.loadConfig();
      const loggingConfig = await configLoader.getLoggingConfig();
      
      // Reconfigure logger with proper file logging settings
       const loggerOptions: any = {
         level: loggingConfig.level as any,
         enableFile: loggingConfig.file.enabled,
         enableConsole: loggingConfig.console.enabled,
         maskSecrets: true
       };
       
       // Only add logFile if file logging is enabled
       if (loggingConfig.file.enabled) {
         loggerOptions.logFile = path.join(process.cwd(), loggingConfig.file.path);
       }
      
      // Create new logger with proper configuration
      const configuredLogger = new Logger(loggerOptions);
      
      // Override with verbose flag if provided
      if (options.verbose) {
        configuredLogger.setLevel('debug');
      }
      
      configuredLogger.info(chalk.blue('🚀 Starting Azure DevOps PR Review...'));
      
      // Validate required parameters
      if (!options.prUrl && !options.pr) {
        throw new Error('Either --pr-url or --pr (with --org, --project, --repo) must be provided');
      }

      if (options.pr && (!options.org || !options.project || !options.repo)) {
        throw new Error('When using --pr, you must also provide --org, --project, and --repo');
      }

      // Validate severity threshold
      const validSeverities = ['info', 'warn', 'error'];
      if (!validSeverities.includes(options.severityThreshold)) {
        throw new Error(`Invalid severity threshold. Must be one of: ${validSeverities.join(', ')}`);
      }

      // Validate output format
      const validFormats = ['table', 'json'];
      if (!validFormats.includes(options.format)) {
        throw new Error(`Invalid format. Must be one of: ${validFormats.join(', ')}`);
      }

      // Create review orchestrator and run review
      const orchestrator = new ReviewOrchestrator(configuredLogger, options);
      const result = await orchestrator.run();

      // Handle exit codes based on results
      if (result.hasErrors) {
        if (result.errorMessage) {
          configuredLogger.error(chalk.red(`❌ ${result.errorMessage}`));
          if (options.verbose && result.errorStack) {
            configuredLogger.debug(result.errorStack);
          }
        } else {
          configuredLogger.error(chalk.red('❌ Review completed with errors'));
        }
        process.exit(2);
      } else if (result.hasFindings && options.severityThreshold !== 'info') {
        logger.warn(chalk.yellow('⚠️  Review completed with findings above threshold'));
        process.exit(2);
      } else {
        logger.info(chalk.green('✅ Review completed successfully'));
        process.exit(0);
      }

    } catch (error) {
      await errorHandler.handle(error);
    }
  });

// Config command for setup
program
  .command('config')
  .description('Configure Azure DevOps and LLM settings')
  .option('--show', 'Show current configuration', false)
  .option('--set <key=value>', 'Set configuration value')
  .action(async (options) => {
    try {
      logger.info(chalk.blue('⚙️  Configuration management'));
      
      if (options.show) {
        // TODO: Implement config show
        logger.info('Configuration display not yet implemented');
      }
      
      if (options.set) {
        // TODO: Implement config set
        logger.info('Configuration setting not yet implemented');
      }
      
    } catch (error) {
      await errorHandler.handle(error);
    }
  });

// Version command
program
  .command('version')
  .description('Show version information')
  .action(() => {
    console.log(chalk.blue('ADO Review CLI v1.0.0'));
    console.log(chalk.gray('Azure DevOps PR Review CLI - AI Agent supported'));
  });

// Global error handling
process.on('uncaughtException', async (error) => {
  await errorHandler.handle(error);
  process.exit(5);
});

process.on('unhandledRejection', async (reason) => {
  await errorHandler.handle(new Error(`Unhandled rejection: ${reason}`));
  process.exit(5);
});

// Parse command line arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
