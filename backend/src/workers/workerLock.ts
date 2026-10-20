/**
 * Module 10: System Integration & Security
 * Stage 10.3.2: Single-Host CLI Worker Mutual Exclusion
 *
 * Kernel-enforced single-host mutual exclusion via Node.js built-in net.Server.
 * Binds exclusively to loopback 127.0.0.1 on the configured port.
 *
 * Invariants:
 * - Operating system kernel guarantees port exclusivity.
 * - Lock contention (EADDRINUSE) triggers an intentional skip without executing queries.
 * - Abnormal worker termination (SIGKILL, crash) is immediately released by OS kernel.
 * - Stale diagnostic files cannot block socket acquisition.
 * - Zero external dependencies (uses native Node.js net, os, fs, path).
 */

import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../config/logger.js';

export interface LockDiagnosticInfo {
  pid: number;
  startedAt: string;
  port: number;
  host: string;
}

export type LockAcquisitionResult =
  | {
      acquired: true;
      port: number;
      host: string;
      lockFilePath: string;
    }
  | {
      acquired: false;
      code: string;
      port: number;
      host: string;
      existingDiagnostic?: LockDiagnosticInfo;
      error: Error;
    };

export interface SingleHostLockOptions {
  port: number;
  host?: string;
  lockFilePath?: string;
}

export class SingleHostLock {
  private server: net.Server | null = null;
  private readonly port: number;
  private readonly host: string;
  private readonly lockFilePath: string;
  private isAcquired: boolean = false;

  constructor(options: SingleHostLockOptions) {
    this.port = options.port;
    this.host = options.host || '127.0.0.1';
    this.lockFilePath =
      options.lockFilePath ||
      path.join(os.tmpdir(), `agrishield-risk-worker-${this.port}.lock`);
  }

  public getPort(): number {
    return this.port;
  }

  public getHost(): string {
    return this.host;
  }

  public getLockFilePath(): string {
    return this.lockFilePath;
  }

  public isHeld(): boolean {
    return this.isAcquired && this.server !== null && this.server.listening;
  }

  /**
   * Attempt to acquire the single-host lock by binding the TCP server socket to 127.0.0.1:port.
   * On EADDRINUSE: reports contention with diagnostic info from previous run (if available).
   * On other socket errors: reports failure code.
   * On success: writes diagnostic metadata file and retains open socket for lifecycle.
   */
  public async acquire(): Promise<LockAcquisitionResult> {
    if (this.isAcquired && this.server && this.server.listening) {
      return {
        acquired: true,
        port: this.port,
        host: this.host,
        lockFilePath: this.lockFilePath,
      };
    }

    return new Promise<LockAcquisitionResult>((resolve) => {
      const server = net.createServer({ pauseOnConnect: true });

      // Immediately destroy any unsolicited connection attempts
      server.on('connection', (socket) => {
        try {
          socket.destroy();
        } catch {}
      });

      const onListening = () => {
        server.removeListener('error', onError);
        this.server = server;
        this.isAcquired = true;

        // Catch subsequent asynchronous socket errors without crashing
        this.server.on('error', (err) => {
          logger.error(
            `[SingleHostLock] Unexpected socket error on ${this.host}:${this.port}:`,
            err
          );
        });

        // Write diagnostic lock metadata (the socket itself is the true lock)
        try {
          const diag: LockDiagnosticInfo = {
            pid: process.pid,
            startedAt: new Date().toISOString(),
            port: this.port,
            host: this.host,
          };
          fs.writeFileSync(this.lockFilePath, JSON.stringify(diag, null, 2), 'utf-8');
        } catch (fileErr) {
          logger.warn(
            `[SingleHostLock] Could not write diagnostic lock file ${this.lockFilePath}:`,
            fileErr
          );
        }

        resolve({
          acquired: true,
          port: this.port,
          host: this.host,
          lockFilePath: this.lockFilePath,
        });
      };

      const onError = (err: any) => {
        server.removeListener('listening', onListening);
        try {
          server.close();
        } catch {}

        if (err.code === 'EADDRINUSE') {
          let existingDiagnostic: LockDiagnosticInfo | undefined;
          try {
            if (fs.existsSync(this.lockFilePath)) {
              const content = fs.readFileSync(this.lockFilePath, 'utf-8');
              existingDiagnostic = JSON.parse(content);
            }
          } catch {}

          resolve({
            acquired: false,
            code: 'EADDRINUSE',
            port: this.port,
            host: this.host,
            existingDiagnostic,
            error: err,
          });
        } else {
          resolve({
            acquired: false,
            code: err.code || 'UNKNOWN',
            port: this.port,
            host: this.host,
            error: err,
          });
        }
      };

      server.once('error', onError);
      server.once('listening', onListening);

      try {
        server.listen(this.port, this.host);
      } catch (syncErr: any) {
        onError(syncErr);
      }
    });
  }

  /**
   * Release the single-host lock.
   * Closes the bound server socket and unlinks the diagnostic file.
   * Idempotent: safe to call multiple times.
   */
  public async release(): Promise<void> {
    const serverToClose = this.server;
    this.server = null;
    this.isAcquired = false;

    // Remove diagnostic metadata file
    try {
      if (fs.existsSync(this.lockFilePath)) {
        fs.unlinkSync(this.lockFilePath);
      }
    } catch {}

    if (serverToClose) {
      await new Promise<void>((resolve) => {
        try {
          serverToClose.close(() => resolve());
        } catch {
          resolve();
        }
      });
    }
  }
}
