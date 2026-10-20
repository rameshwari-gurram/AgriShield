/**
 * Module 10: System Integration & Security
 * Stage 10.3.2: CLI Worker and Single-Host Mutual Exclusion
 *
 * CLI worker executing automated risk evaluation with kernel-enforced mutual exclusion.
 *
 * Invariants:
 * - Operating system kernel guarantees port exclusivity via 127.0.0.1:port bind.
 * - If disabled (AUTOMATED_RISK_EVALUATION_ENABLED=false) and not --force:
 *   exits immediately with code 0 and performs 0 DB queries / 0 evaluations.
 * - If port is occupied (EADDRINUSE):
 *   logs intentional skip, exits with code 0, performs 0 evaluations.
 * - Non-EADDRINUSE bind errors yield exit code 1.
 * - Clean batch completion yields exit code 0.
 * - Partial failure or soft deadline expiration yields exit code 2.
 * - Disconnects Prisma database at most once upon exit.
 */

import { env } from '../config/env.config.js';
import { logger } from '../config/logger.js';
import { disconnectDatabase } from '../config/db.js';
import { SingleHostLock } from './workerLock.js';
import {
  AutomatedRiskEvaluationService,
  automatedRiskEvaluationService as defaultService,
  AutomatedRiskEvaluationSummary,
} from '../services/automatedRiskEvaluation.service.js';

export interface WorkerRunOptions {
  force?: boolean;
  dryRun?: boolean;
  batchSize?: number;
  timeoutMs?: number;
  port?: number;
  host?: string;
  farmIds?: string[];
  referenceTime?: Date;
  lockFilePath?: string;
  service?: AutomatedRiskEvaluationService;
  help?: boolean;
}

export interface WorkerRunResult {
  status:
    | 'SUCCESS'
    | 'PARTIAL_SUCCESS'
    | 'DISABLED'
    | 'LOCK_CONTENTION'
    | 'LOCK_ERROR'
    | 'DEADLINE_EXCEEDED'
    | 'FATAL_ERROR';
  exitCode: 0 | 1 | 2;
  summary?: AutomatedRiskEvaluationSummary;
  message?: string;
  error?: string;
}

let dbDisconnected = false;

export const disconnectDatabaseSafely = async (): Promise<void> => {
  if (dbDisconnected) return;
  dbDisconnected = true;
  try {
    await disconnectDatabase();
  } catch (err) {
    logger.error('[AutomatedRiskEvaluationWorker] Error during database disconnect:', err);
  }
};

/**
 * Parse command line arguments for the worker CLI.
 */
export const parseCliArgs = (args: string[]): WorkerRunOptions => {
  const options: WorkerRunOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-dry-run' || arg === '--live') {
      options.dryRun = false;
    } else if (arg.startsWith('--batch-size=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val) && val > 0) options.batchSize = val;
    } else if (arg === '--batch-size' && i + 1 < args.length) {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val) && val > 0) options.batchSize = val;
    } else if (arg.startsWith('--timeout-ms=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val) && val > 0) options.timeoutMs = val;
    } else if (arg === '--timeout-ms' && i + 1 < args.length) {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val) && val > 0) options.timeoutMs = val;
    } else if (arg.startsWith('--port=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val) && val > 0) options.port = val;
    } else if (arg === '--port' && i + 1 < args.length) {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val) && val > 0) options.port = val;
    } else if (arg.startsWith('--farm-ids=')) {
      const val = arg.split('=')[1];
      options.farmIds = val.split(',').map((id) => id.trim()).filter(Boolean);
    } else if (arg === '--farm-ids' && i + 1 < args.length) {
      const val = args[++i];
      options.farmIds = val.split(',').map((id) => id.trim()).filter(Boolean);
    } else if (arg.startsWith('--farm-id=')) {
      const val = arg.split('=')[1].trim();
      if (val) options.farmIds = [val];
    } else if (arg === '--farm-id' && i + 1 < args.length) {
      const val = args[++i].trim();
      if (val) options.farmIds = [val];
    }
  }

  return options;
};

export const printHelp = (): void => {
  console.log(`
AgriShield Module 10 — Automated Risk Evaluation CLI Worker
Usage:
  npm run worker:risk-evaluation -- [options]
  npx tsx src/workers/automatedRiskEvaluation.worker.ts [options]

Options:
  --dry-run                 Execute in dry-run mode (default: env.AUTOMATED_RISK_EVALUATION_DRY_RUN)
  --no-dry-run, --live      Execute in live mode (creates claims strictly in PENDING status)
  --force                   Execute even if AUTOMATED_RISK_EVALUATION_ENABLED is false
  --batch-size <number>     Maximum number of active farms to evaluate (default: 25)
  --timeout-ms <number>     Execution deadline in milliseconds (default: 60000)
  --port <number>           Mutual exclusion TCP port (default: env.AUTOMATED_RISK_EVALUATION_LOCK_PORT or 54329)
  --farm-ids <id1,id2,...>  Comma-separated list of specific farm UUIDs to evaluate
  --farm-id <id>            Single farm UUID to evaluate
  --help, -h                Display this help message and exit

Exit Codes:
  0   Success (or intentional skip due to disabled flag or active lock contention)
  1   Fatal infrastructure failure or socket bind error
  2   Partial batch success or deadline exceeded
`);
};

/**
 * Execute the automated risk evaluation worker run.
 */
export async function runWorker(
  options: WorkerRunOptions = {}
): Promise<WorkerRunResult> {
  const service = options.service || defaultService;
  const isForced = options.force ?? false;
  const isEnabled = service.isEnabled();

  // 1. Guard: Check feature flag before touching any resource
  if (!isEnabled && !isForced) {
    const message =
      'Automated risk evaluation worker is disabled (AUTOMATED_RISK_EVALUATION_ENABLED=false). Pass --force to execute. Exiting cleanly.';
    logger.info(`[AutomatedRiskEvaluationWorker] ${message}`);
    return {
      status: 'DISABLED',
      exitCode: 0,
      message,
    };
  }

  // 2. Resolve lock configuration
  const port =
    options.port ??
    env.AUTOMATED_RISK_EVALUATION_LOCK_PORT ??
    54329;
  const host = options.host || '127.0.0.1';
  const lock = new SingleHostLock({
    port,
    host,
    lockFilePath: options.lockFilePath,
  });

  // 3. Acquire kernel-enforced mutual exclusion lock
  const lockResult = await lock.acquire();

  if (!lockResult.acquired) {
    if (lockResult.code === 'EADDRINUSE') {
      const activeDiag = lockResult.existingDiagnostic;
      const diagMsg = activeDiag
        ? `(Active PID: ${activeDiag.pid}, started: ${activeDiag.startedAt})`
        : `(Port ${port} in use)`;
      const message = `Lock contention on 127.0.0.1:${port}: another instance is running ${diagMsg}. Skipping execution.`;
      logger.info(`[AutomatedRiskEvaluationWorker] ${message}`);
      return {
        status: 'LOCK_CONTENTION',
        exitCode: 0,
        message,
      };
    }

    const message = `Fatal lock acquisition error on 127.0.0.1:${port}: ${lockResult.error.message}`;
    logger.error(`[AutomatedRiskEvaluationWorker] ${message}`);
    return {
      status: 'LOCK_ERROR',
      exitCode: 1,
      message,
      error: lockResult.error.message,
    };
  }

  logger.info(
    `[AutomatedRiskEvaluationWorker] Acquired single-host lock on 127.0.0.1:${port} (PID: ${process.pid}). Starting batch evaluation...`
  );

  // 4. Setup graceful termination handlers
  let cleaningUp = false;
  const cleanup = async () => {
    if (cleaningUp) return;
    cleaningUp = true;
    try {
      await lock.release();
    } catch (err) {
      logger.warn('[AutomatedRiskEvaluationWorker] Error releasing lock:', err);
    }
    await disconnectDatabaseSafely();
  };

  const sigintHandler = async () => {
    logger.info('[AutomatedRiskEvaluationWorker] SIGINT received. Shutting down gracefully...');
    await cleanup();
    process.exit(130);
  };

  const sigtermHandler = async () => {
    logger.info('[AutomatedRiskEvaluationWorker] SIGTERM received. Shutting down gracefully...');
    await cleanup();
    process.exit(143);
  };

  process.once('SIGINT', sigintHandler);
  process.once('SIGTERM', sigtermHandler);

  // 5. Execute batch evaluation
  try {
    const dryRun = options.dryRun ?? env.AUTOMATED_RISK_EVALUATION_DRY_RUN;
    const batchSize =
      options.batchSize ?? env.AUTOMATED_RISK_EVALUATION_BATCH_SIZE;
    const timeoutMs =
      options.timeoutMs ?? env.AUTOMATED_RISK_EVALUATION_TIMEOUT_MS;

    const summary = await service.executeBatch({
      dryRun,
      batchSize,
      timeoutMs,
      farmIds: options.farmIds,
      referenceTime: options.referenceTime,
      force: isForced,
    });

    logger.info(
      `[AutomatedRiskEvaluationWorker] Batch completed: status=${summary.status}, attempted=${summary.attempted}, processed=${summary.processed}, skipped=${summary.skipped}, failed=${summary.failed}, claimsCreated=${summary.claimsCreated}, claimsProjected=${summary.claimsProjected}, durationMs=${summary.durationMs}`
    );

    return {
      status: summary.status,
      exitCode: summary.exitCode,
      summary,
    };
  } catch (err: any) {
    const message = err?.message || 'Fatal error during worker batch execution';
    logger.error(`[AutomatedRiskEvaluationWorker] ${message}`, err);
    return {
      status: 'FATAL_ERROR',
      exitCode: 1,
      message,
      error: message,
    };
  } finally {
    process.removeListener('SIGINT', sigintHandler);
    process.removeListener('SIGTERM', sigtermHandler);
    await cleanup();
  }
}

/**
 * CLI Entry point
 */
export async function main(): Promise<number> {
  try {
    const options = parseCliArgs(process.argv.slice(2));

    if (options.help) {
      printHelp();
      return 0;
    }

    const result = await runWorker(options);

    if (result.summary) {
      console.log('\n--- Automated Risk Evaluation Summary ---');
      console.log(`Status:           ${result.summary.status}`);
      console.log(`Dry Run:          ${result.summary.dryRun}`);
      console.log(`Attempted:        ${result.summary.attempted}`);
      console.log(`Processed:        ${result.summary.processed}`);
      console.log(`Skipped:          ${result.summary.skipped}`);
      console.log(`Failed:           ${result.summary.failed}`);
      console.log(`Claims Created:   ${result.summary.claimsCreated}`);
      console.log(`Claims Projected: ${result.summary.claimsProjected}`);
      console.log(`Duration:         ${result.summary.durationMs}ms`);
      console.log(`Exit Code:        ${result.exitCode}\n`);
    } else if (result.message) {
      console.log(`\n[AutomatedRiskEvaluationWorker] ${result.message}\n`);
    }

    return result.exitCode;
  } catch (err: any) {
    logger.error('[AutomatedRiskEvaluationWorker] Fatal CLI runner error:', err);
    await disconnectDatabaseSafely();
    return 1;
  }
}

const isDirectExecution = (): boolean => {
  if (typeof process === 'undefined' || !process.argv || !process.argv[1]) {
    return false;
  }
  const entry = process.argv[1].replace(/\\/g, '/');
  return (
    entry.endsWith('automatedRiskEvaluation.worker.ts') ||
    entry.endsWith('automatedRiskEvaluation.worker.js')
  );
};

if (isDirectExecution()) {
  main()
    .then((code) => {
      process.exit(code);
    })
    .catch((err) => {
      logger.error('[AutomatedRiskEvaluationWorker] Unhandled fatal error:', err);
      process.exit(1);
    });
}
