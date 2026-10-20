/**
 * Module 10: System Integration & Security
 * Stage 10.3.2: CLI Worker and Single-Host Mutual Exclusion Unit Test Suite
 *
 * Verifies all 10 required invariants and edge cases for the single-host worker:
 * 1. Single-instance acquisition and release.
 * 2. Two concurrent processes on same port -> exactly one executes, second receives EADDRINUSE and exits code 0.
 * 3. Lock contention causes zero evaluation queries.
 * 4. Re-acquisition after worker process exits cleanly.
 * 5. Abnormal termination -> OS kernel frees socket, subsequent worker immediately acquires.
 * 6. Stale diagnostic file does not block socket acquisition.
 * 7. Non-EADDRINUSE bind failure yields code 1.
 * 8. Disabled worker exits code 0 with zero evaluation work.
 * 9. Timeout / partial success yields code 2.
 * 10. Prisma disconnection occurs safely at most once.
 */

import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { SingleHostLock } from '../src/workers/workerLock.js';
import {
  runWorker,
  disconnectDatabaseSafely,
  parseCliArgs,
} from '../src/workers/automatedRiskEvaluation.worker.js';
import {
  AutomatedRiskEvaluationService,
  AutomatedRiskEvaluationSummary,
} from '../src/services/automatedRiskEvaluation.service.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASSED: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Mock service helper for testing worker orchestration without touching live DB
class MockAutomatedRiskEvaluationService {
  public executeBatchCallCount = 0;
  public lastBatchOptions: any = null;
  public enabled: boolean = true;
  public mockSummary: Partial<AutomatedRiskEvaluationSummary> = {};

  constructor(enabled: boolean = true, mockSummary: Partial<AutomatedRiskEvaluationSummary> = {}) {
    this.enabled = enabled;
    this.mockSummary = mockSummary;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public isDryRun(): boolean {
    return true;
  }

  public async executeBatch(options: any): Promise<AutomatedRiskEvaluationSummary> {
    this.executeBatchCallCount++;
    this.lastBatchOptions = options;

    return {
      status: this.mockSummary.status ?? 'SUCCESS',
      exitCode: this.mockSummary.exitCode ?? 0,
      dryRun: options?.dryRun ?? true,
      batchSize: options?.batchSize ?? 25,
      attempted: this.mockSummary.attempted ?? 1,
      processed: this.mockSummary.processed ?? 1,
      skipped: this.mockSummary.skipped ?? 0,
      failed: this.mockSummary.failed ?? 0,
      claimsCreated: this.mockSummary.claimsCreated ?? 0,
      claimsProjected: this.mockSummary.claimsProjected ?? 1,
      durationMs: 42,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      farmOutcomes: [],
      ...this.mockSummary,
    };
  }
}

async function runAllTests() {
  console.log('\n================================================================================');
  console.log('🧪 Running Module 10 Stage 10.3.2: CLI Worker & Single-Host Lock Tests');
  console.log('================================================================================\n');

  const BASE_TEST_PORT = 54340;

  // ---------------------------------------------------------------------------
  // CHECKPOINT 1: Single-Instance Lock Acquisition & Clean Release
  // ---------------------------------------------------------------------------
  console.log('--- CHECKPOINT 1: Single-Instance Lock Acquisition & Clean Release ---');
  {
    const port = BASE_TEST_PORT + 1;
    const lockFilePath = path.join(os.tmpdir(), `test-lock-${port}.lock`);
    if (fs.existsSync(lockFilePath)) fs.unlinkSync(lockFilePath);

    const lock = new SingleHostLock({ port, host: '127.0.0.1', lockFilePath });
    assert(!lock.isHeld(), '1.1 Lock is not held before acquisition');

    const result = await lock.acquire();
    assert(result.acquired === true, '1.2 Lock successfully acquired');
    assert(lock.isHeld(), '1.3 Lock reports isHeld() === true');
    assert(fs.existsSync(lockFilePath), '1.4 Diagnostic lock file was written');

    const rawDiag = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'));
    assert(rawDiag.pid === process.pid, '1.5 Diagnostic file contains current PID');
    assert(rawDiag.port === port, '1.6 Diagnostic file contains correct port');
    assert(rawDiag.host === '127.0.0.1', '1.7 Diagnostic file contains correct loopback host');

    await lock.release();
    assert(!lock.isHeld(), '1.8 Lock reports isHeld() === false after release');
    assert(!fs.existsSync(lockFilePath), '1.9 Diagnostic lock file removed on clean release');
  }

  // ---------------------------------------------------------------------------
  // CHECKPOINT 2: Two Concurrent Instances on Same Port (Contention Handling)
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 2: Two Concurrent Instances on Same Port ---');
  {
    const port = BASE_TEST_PORT + 2;
    const lockFilePath = path.join(os.tmpdir(), `test-lock-${port}.lock`);
    if (fs.existsSync(lockFilePath)) fs.unlinkSync(lockFilePath);

    // Primary instance acquires lock
    const primaryLock = new SingleHostLock({ port, host: '127.0.0.1', lockFilePath });
    const primaryResult = await primaryLock.acquire();
    assert(primaryResult.acquired === true, '2.1 Primary instance acquired lock');

    // Secondary worker attempts to execute on same port
    const mockService = new MockAutomatedRiskEvaluationService(true);
    const secondaryResult = await runWorker({
      port,
      force: true,
      lockFilePath,
      service: mockService as unknown as AutomatedRiskEvaluationService,
    });

    assert(secondaryResult.status === 'LOCK_CONTENTION', '2.2 Secondary instance detected LOCK_CONTENTION');
    assert(secondaryResult.exitCode === 0, '2.3 Contended worker returned intentional skip exit code 0');
    assert(mockService.executeBatchCallCount === 0, '2.4 Contended worker performed 0 batch executions');

    // Also spawn a real CLI worker process via command-line to verify actual process exit code 0
    const cliChild = spawn(
      process.platform === 'win32' ? 'cmd.exe' : 'npx',
      process.platform === 'win32'
        ? ['/c', 'npx', 'tsx', 'src/workers/automatedRiskEvaluation.worker.ts', `--port=${port}`, '--force']
        : ['tsx', 'src/workers/automatedRiskEvaluation.worker.ts', `--port=${port}`, '--force'],
      { stdio: 'pipe' }
    );

    const cliExitCode = await new Promise<number>((resolve) => {
      cliChild.on('close', (code) => resolve(code ?? 0));
    });

    assert(cliExitCode === 0, '2.5 Real CLI child process exited with code 0 on lock contention');

    // Release primary lock
    await primaryLock.release();
    assert(!primaryLock.isHeld(), '2.6 Primary lock released cleanly');
  }

  // ---------------------------------------------------------------------------
  // CHECKPOINT 3: Lock Contention Causes Zero Evaluation Queries
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 3: Zero Evaluation Queries on Contention ---');
  {
    const port = BASE_TEST_PORT + 3;
    const holder = net.createServer();
    await new Promise<void>((resolve) => holder.listen(port, '127.0.0.1', () => resolve()));

    const mockService = new MockAutomatedRiskEvaluationService(true);
    const result = await runWorker({
      port,
      force: true,
      service: mockService as unknown as AutomatedRiskEvaluationService,
    });

    assert(result.status === 'LOCK_CONTENTION', '3.1 Status is LOCK_CONTENTION when port pre-occupied');
    assert(result.exitCode === 0, '3.2 Exit code is strictly 0 on contention');
    assert(mockService.executeBatchCallCount === 0, '3.3 Zero batch evaluation calls made');

    await new Promise<void>((resolve) => holder.close(() => resolve()));
  }

  // ---------------------------------------------------------------------------
  // CHECKPOINT 4: Re-acquisition After Clean Worker Exit
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 4: Re-acquisition After Clean Exit ---');
  {
    const port = BASE_TEST_PORT + 4;
    const mockService = new MockAutomatedRiskEvaluationService(true);

    const firstRun = await runWorker({
      port,
      force: true,
      service: mockService as unknown as AutomatedRiskEvaluationService,
    });
    assert(firstRun.status === 'SUCCESS', '4.1 First worker run completed with SUCCESS');
    assert(firstRun.exitCode === 0, '4.2 First worker run exited with 0');
    assert(mockService.executeBatchCallCount === 1, '4.3 First worker executed 1 batch');

    // Immediate second worker run on identical port
    const secondRun = await runWorker({
      port,
      force: true,
      service: mockService as unknown as AutomatedRiskEvaluationService,
    });
    assert(secondRun.status === 'SUCCESS', '4.4 Second worker immediately acquired same port');
    assert(secondRun.exitCode === 0, '4.5 Second worker exited with 0');
    assert(mockService.executeBatchCallCount === 2, '4.6 Second worker executed successfully');
  }

  // ---------------------------------------------------------------------------
  // CHECKPOINT 5: Abnormal Termination — OS Kernel Frees Bound Socket
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 5: Abnormal Termination & Kernel Port Recovery ---');
  {
    const port = BASE_TEST_PORT + 5;
    const inlineScript = `
      const net = require('net');
      const server = net.createServer();
      server.listen(${port}, '127.0.0.1', () => {
        process.stdout.write('LISTENING\\n');
      });
      setInterval(() => {}, 1000);
    `;

    // Spawn child process that binds port
    const child = spawn(process.execPath, ['-e', inlineScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    await new Promise<void>((resolve, reject) => {
      child.stdout.on('data', (chunk) => {
        if (chunk.toString().includes('LISTENING')) resolve();
      });
      child.on('error', reject);
    });

    // Verify port is occupied by child
    const testLockBefore = new SingleHostLock({ port, host: '127.0.0.1' });
    const probe = await testLockBefore.acquire();
    assert(probe.acquired === false && probe.code === 'EADDRINUSE', '5.1 Port verified in-use by child process');

    // Abruptly kill child process with SIGKILL (prevents any application cleanup)
    const childExitPromise = new Promise<void>((resolve) => {
      child.on('exit', () => resolve());
    });

    // Windows taskkill /F or child.kill('SIGKILL')
    if (process.platform === 'win32') {
      try {
        child.kill('SIGKILL');
      } catch {
        spawn('taskkill', ['/F', '/PID', String(child.pid)]);
      }
    } else {
      child.kill('SIGKILL');
    }

    await childExitPromise;

    // Small delay for OS socket transition
    await new Promise((r) => setTimeout(r, 100));

    // Subsequent worker attempts immediate acquisition
    const testLockAfter = new SingleHostLock({ port, host: '127.0.0.1' });
    const recoveryResult = await testLockAfter.acquire();
    assert(recoveryResult.acquired === true, '5.2 OS kernel freed socket immediately after SIGKILL');
    assert(testLockAfter.isHeld(), '5.3 Subsequent worker acquired port without deadlock');

    await testLockAfter.release();
  }

  // ---------------------------------------------------------------------------
  // CHECKPOINT 6: Stale Diagnostic File Safety
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 6: Stale Diagnostic File Safety ---');
  {
    const port = BASE_TEST_PORT + 6;
    const lockFilePath = path.join(os.tmpdir(), `test-lock-${port}.lock`);

    // Write a stale diagnostic lock file simulating a dead previous worker
    const staleDiag = {
      pid: 99999999,
      startedAt: '2020-01-01T00:00:00.000Z',
      port,
      host: '127.0.0.1',
    };
    fs.writeFileSync(lockFilePath, JSON.stringify(staleDiag, null, 2), 'utf-8');
    assert(fs.existsSync(lockFilePath), '6.1 Stale diagnostic file created');

    // Acquire lock on free port with existing stale file
    const lock = new SingleHostLock({ port, host: '127.0.0.1', lockFilePath });
    const result = await lock.acquire();

    assert(result.acquired === true, '6.2 Stale diagnostic file did NOT block socket acquisition');
    const updatedDiag = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'));
    assert(updatedDiag.pid === process.pid, '6.3 Diagnostic file overwritten with current live PID');

    await lock.release();
    assert(!fs.existsSync(lockFilePath), '6.4 Diagnostic file cleaned up');
  }

  // ---------------------------------------------------------------------------
  // CHECKPOINT 7: Non-EADDRINUSE Bind Failure Yields Exit Code 1
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 7: Non-EADDRINUSE Bind Failure Handling ---');
  {
    // Binding to an unroutable / invalid interface IP triggers EADDRNOTAVAIL
    const invalidHost = '256.256.256.256';
    const mockService = new MockAutomatedRiskEvaluationService(true);

    const result = await runWorker({
      port: BASE_TEST_PORT + 7,
      host: invalidHost,
      force: true,
      service: mockService as unknown as AutomatedRiskEvaluationService,
    });

    assert(result.status === 'LOCK_ERROR', '7.1 Status is LOCK_ERROR on non-EADDRINUSE failure');
    assert(result.exitCode === 1, '7.2 Exit code is strictly 1 for fatal socket bind failure');
    assert(mockService.executeBatchCallCount === 0, '7.3 Zero evaluation queries performed');
  }

  // ---------------------------------------------------------------------------
  // CHECKPOINT 8: Disabled Worker Safety (Exit Code 0, 0 DB Queries)
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 8: Disabled Worker Safety ---');
  {
    const mockService = new MockAutomatedRiskEvaluationService(false); // disabled

    const result = await runWorker({
      port: BASE_TEST_PORT + 8,
      force: false,
      service: mockService as unknown as AutomatedRiskEvaluationService,
    });

    assert(result.status === 'DISABLED', '8.1 Status is DISABLED');
    assert(result.exitCode === 0, '8.2 Exit code is strictly 0 when worker is disabled');
    assert(mockService.executeBatchCallCount === 0, '8.3 Zero batch evaluation calls made when disabled');

    // Verify force flag overrides disabled state
    const forceResult = await runWorker({
      port: BASE_TEST_PORT + 8,
      force: true,
      service: mockService as unknown as AutomatedRiskEvaluationService,
    });
    assert(forceResult.status === 'SUCCESS', '8.4 Force flag overrides disabled state');
    assert(mockService.executeBatchCallCount === 1, '8.5 Exactly 1 batch executed under --force');
  }

  // ---------------------------------------------------------------------------
  // CHECKPOINT 9: Timeout / Partial Success Yields Exit Code 2
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 9: Partial Success & Deadline Exceeded Exit Code Contract ---');
  {
    const portPartial = BASE_TEST_PORT + 9;
    const partialService = new MockAutomatedRiskEvaluationService(true, {
      status: 'PARTIAL_SUCCESS',
      exitCode: 2,
      failed: 1,
    });

    const partialResult = await runWorker({
      port: portPartial,
      force: true,
      service: partialService as unknown as AutomatedRiskEvaluationService,
    });
    assert(partialResult.status === 'PARTIAL_SUCCESS', '9.1 Partial success status propagated');
    assert(partialResult.exitCode === 2, '9.2 Partial success yields exit code 2');

    const portDeadline = BASE_TEST_PORT + 10;
    const deadlineService = new MockAutomatedRiskEvaluationService(true, {
      status: 'DEADLINE_EXCEEDED',
      exitCode: 2,
    });

    const deadlineResult = await runWorker({
      port: portDeadline,
      force: true,
      service: deadlineService as unknown as AutomatedRiskEvaluationService,
    });
    assert(deadlineResult.status === 'DEADLINE_EXCEEDED', '9.3 Deadline exceeded status propagated');
    assert(deadlineResult.exitCode === 2, '9.4 Deadline exceeded yields exit code 2');
  }

  // ---------------------------------------------------------------------------
  // CHECKPOINT 10: Prisma Disconnection Idempotency & CLI Parser
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 10: Safe Prisma Disconnect & CLI Flag Parsing ---');
  {
    // 10.1 Multiple disconnect calls must not throw
    let disconnectError: Error | null = null;
    try {
      await disconnectDatabaseSafely();
      await disconnectDatabaseSafely();
      await disconnectDatabaseSafely();
    } catch (err: any) {
      disconnectError = err;
    }
    assert(disconnectError === null, '10.1 Disconnect database safely is idempotent and does not throw');

    // 10.2 CLI argument parsing verification
    const parsed = parseCliArgs([
      '--dry-run',
      '--force',
      '--batch-size=50',
      '--timeout-ms=45000',
      '--port=54399',
      '--farm-ids=f1,f2,f3',
    ]);
    assert(parsed.dryRun === true, '10.2 CLI parser: --dry-run parsed correctly');
    assert(parsed.force === true, '10.3 CLI parser: --force parsed correctly');
    assert(parsed.batchSize === 50, '10.4 CLI parser: --batch-size=50 parsed correctly');
    assert(parsed.timeoutMs === 45000, '10.5 CLI parser: --timeout-ms=45000 parsed correctly');
    assert(parsed.port === 54399, '10.6 CLI parser: --port=54399 parsed correctly');
    assert(
      Array.isArray(parsed.farmIds) && parsed.farmIds.length === 3 && parsed.farmIds[0] === 'f1',
      '10.7 CLI parser: --farm-ids parsed correctly into array'
    );

    const parsedLive = parseCliArgs(['--live', '--farm-id=f-single']);
    assert(parsedLive.dryRun === false, '10.8 CLI parser: --live sets dryRun=false');
    assert(
      Array.isArray(parsedLive.farmIds) && parsedLive.farmIds[0] === 'f-single',
      '10.9 CLI parser: --farm-id sets single farm array'
    );
  }

  console.log('\n================================================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed across all checkpoints`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Unhandled test suite failure:', err);
  process.exit(1);
});
