import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { AuthenticatedPrincipal } from '../auth/types/authenticated-request';
import type { StartQaRunDto } from './dto/qa.dto';

export type QaScriptCategory = 'smoke' | 'regression' | 'static' | 'build' | 'database' | 'frontend';
export type QaRunStatus = 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'CANCELLED';
export type QaRunStream = 'stdout' | 'stderr' | 'system';

export type QaScriptSummary = {
  id: string;
  name: string;
  description: string;
  category: QaScriptCategory;
  scope: 'backend' | 'frontend';
  command: string;
  timeoutMs: number;
  requiresRunningApi: boolean;
  available: boolean;
  unavailableReason?: string;
  lastRun?: QaRunListItem;
};

export type QaRunLogLine = {
  at: string;
  stream: QaRunStream;
  message: string;
};

export type QaRunListItem = {
  id: string;
  scriptId: string;
  scriptName: string;
  status: QaRunStatus;
  exitCode: number | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  actorEmail: string;
  actorRoles: string[];
  command: string;
  scope: 'backend' | 'frontend';
  category: QaScriptCategory;
  notes?: string;
};

export type QaRunDetail = QaRunListItem & {
  output: string;
  logs: QaRunLogLine[];
};

type QaScriptDefinition = {
  id: string;
  name: string;
  description: string;
  category: QaScriptCategory;
  scope: 'backend' | 'frontend';
  npmScript: string;
  npmArgs?: string[];
  timeoutMs: number;
  requiresRunningApi: boolean;
  cwd: string;
};

type MutableQaRun = QaRunDetail & {
  startedAtMs: number;
  process?: ChildProcessWithoutNullStreams;
  timedOut?: boolean;
  cancelled?: boolean;
  timeout?: NodeJS.Timeout;
};

const MAX_RUNS = 50;
const MAX_RUNNING = 2;
const MAX_OUTPUT_CHARS = 120_000;
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

@Injectable()
export class QaService {
  private readonly backendRoot = process.cwd();
  private readonly frontendRoot = resolve(this.backendRoot, '..', 'timesync-fe');
  private readonly runs = new Map<string, MutableQaRun>();
  private readonly runOrder: string[] = [];

  private readonly scripts: QaScriptDefinition[] = [
    {
      id: 'backend.smoke.attendance-leave',
      name: 'Attendance + Leave smoke',
      description: 'Exercises attendance and leave role flows against the running API.',
      category: 'smoke',
      scope: 'backend',
      npmScript: 'smoke:attendance-leave',
      timeoutMs: 120_000,
      requiresRunningApi: true,
      cwd: this.backendRoot,
    },
    {
      id: 'backend.smoke.recruitment',
      name: 'Recruitment smoke',
      description: 'Checks recruitment API access for tenant admin, manager, and employee roles.',
      category: 'smoke',
      scope: 'backend',
      npmScript: 'smoke:recruitment',
      timeoutMs: 120_000,
      requiresRunningApi: true,
      cwd: this.backendRoot,
    },
    {
      id: 'backend.prisma.validate',
      name: 'Prisma schema validate',
      description: 'Validates the backend Prisma schema and datasource configuration.',
      category: 'database',
      scope: 'backend',
      npmScript: 'prisma:validate',
      timeoutMs: 90_000,
      requiresRunningApi: false,
      cwd: this.backendRoot,
    },
    {
      id: 'backend.lint',
      name: 'Backend lint',
      description: 'Runs ESLint across backend applications, libraries, scripts, and Prisma tests.',
      category: 'static',
      scope: 'backend',
      npmScript: 'lint',
      timeoutMs: 240_000,
      requiresRunningApi: false,
      cwd: this.backendRoot,
    },
    {
      id: 'backend.test.all',
      name: 'Backend regression tests',
      description: 'Runs the full backend Jest suite in serial mode.',
      category: 'regression',
      scope: 'backend',
      npmScript: 'test',
      timeoutMs: 300_000,
      requiresRunningApi: false,
      cwd: this.backendRoot,
    },
    {
      id: 'backend.build',
      name: 'Backend build',
      description: 'Builds the NestJS API gateway project.',
      category: 'build',
      scope: 'backend',
      npmScript: 'build',
      timeoutMs: 300_000,
      requiresRunningApi: false,
      cwd: this.backendRoot,
    },
    {
      id: 'backend.ci.verify',
      name: 'Backend CI verification',
      description: 'Runs generate, validate, build, lint, tests, and OpenAPI export.',
      category: 'regression',
      scope: 'backend',
      npmScript: 'ci:verify',
      timeoutMs: 600_000,
      requiresRunningApi: false,
      cwd: this.backendRoot,
    },
    {
      id: 'frontend.lint',
      name: 'Frontend lint',
      description: 'Runs ESLint for the Next.js frontend.',
      category: 'frontend',
      scope: 'frontend',
      npmScript: 'lint',
      timeoutMs: 240_000,
      requiresRunningApi: false,
      cwd: this.frontendRoot,
    },
    {
      id: 'frontend.build',
      name: 'Frontend build',
      description: 'Builds the Next.js frontend application.',
      category: 'frontend',
      scope: 'frontend',
      npmScript: 'build',
      timeoutMs: 600_000,
      requiresRunningApi: false,
      cwd: this.frontendRoot,
    },
  ];

  listScripts(): QaScriptSummary[] {
    return this.scripts.map((script) => {
      const availability = this.getAvailability(script);
      return {
        id: script.id,
        name: script.name,
        description: script.description,
        category: script.category,
        scope: script.scope,
        command: this.commandFor(script),
        timeoutMs: script.timeoutMs,
        requiresRunningApi: script.requiresRunningApi,
        available: availability.available,
        unavailableReason: availability.reason,
        lastRun: this.findLastRun(script.id),
      };
    });
  }

  listRuns(limit = 25): QaRunListItem[] {
    return this.runOrder
      .slice(0, Math.max(1, Math.min(limit, MAX_RUNS)))
      .map((runId) => this.runs.get(runId))
      .filter((run): run is MutableQaRun => Boolean(run))
      .map((run) => this.toListItem(run));
  }

  getRun(runId: string): QaRunDetail {
    const run = this.runs.get(runId);
    if (!run) throw new NotFoundException('QA run was not found.');
    return this.toDetail(run);
  }

  startRun(actor: AuthenticatedPrincipal, dto: StartQaRunDto): QaRunDetail {
    const script = this.scripts.find((candidate) => candidate.id === dto.scriptId);
    if (!script) throw new BadRequestException('QA script is not available.');

    const availability = this.getAvailability(script);
    if (!availability.available) {
      throw new BadRequestException(availability.reason ?? 'QA script cannot run in this environment.');
    }

    const runningCount = Array.from(this.runs.values()).filter((run) => run.status === 'RUNNING' || run.status === 'QUEUED').length;
    if (runningCount >= MAX_RUNNING) {
      throw new ConflictException(`Only ${MAX_RUNNING} QA runs can execute at the same time.`);
    }

    const now = new Date();
    const run: MutableQaRun = {
      id: randomUUID(),
      scriptId: script.id,
      scriptName: script.name,
      status: 'QUEUED',
      exitCode: null,
      startedAt: now.toISOString(),
      startedAtMs: now.getTime(),
      finishedAt: null,
      durationMs: null,
      actorEmail: actor.email,
      actorRoles: actor.roles,
      command: this.commandFor(script),
      scope: script.scope,
      category: script.category,
      notes: dto.notes?.trim() || undefined,
      output: '',
      logs: [],
    };

    this.runs.set(run.id, run);
    this.runOrder.unshift(run.id);
    this.trimRuns();
    this.spawnRun(script, run);
    return this.toDetail(run);
  }

  cancelRun(runId: string, actor: AuthenticatedPrincipal): QaRunDetail {
    const run = this.runs.get(runId);
    if (!run) throw new NotFoundException('QA run was not found.');

    if (run.status !== 'RUNNING' && run.status !== 'QUEUED') {
      return this.toDetail(run);
    }

    run.cancelled = true;
    this.append(run, 'system', `Cancellation requested by ${actor.email}.`);

    if (run.process?.pid) {
      this.terminate(run.process);
    } else {
      this.finish(run, 'CANCELLED', null);
    }

    return this.toDetail(run);
  }

  private spawnRun(script: QaScriptDefinition, run: MutableQaRun) {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const args = ['run', script.npmScript, ...(script.npmArgs ?? [])];

    run.status = 'RUNNING';
    this.append(run, 'system', `Starting ${this.commandFor(script)} in ${script.cwd}.`);

    const child = spawn(npmCommand, args, {
      cwd: script.cwd,
      env: {
        ...process.env,
        CI: process.env.CI ?? 'true',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
      windowsHide: true,
    });

    run.process = child;
    run.timeout = setTimeout(() => {
      run.timedOut = true;
      this.append(run, 'system', `Run exceeded ${Math.round(script.timeoutMs / 1000)}s timeout. Terminating process.`);
      this.terminate(child);
    }, script.timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => this.append(run, 'stdout', chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => this.append(run, 'stderr', chunk.toString()));
    child.on('error', (error) => {
      this.append(run, 'system', `Process failed to start: ${error.message}`);
      this.finish(run, 'FAILED', null);
    });
    child.on('close', (code) => {
      const status = run.cancelled ? 'CANCELLED' : code === 0 ? 'PASSED' : 'FAILED';
      this.finish(run, status, code);
    });
  }

  private finish(run: MutableQaRun, status: QaRunStatus, exitCode: number | null) {
    if (run.timeout) clearTimeout(run.timeout);
    run.status = status;
    run.exitCode = exitCode;
    run.finishedAt = new Date().toISOString();
    run.durationMs = Date.now() - run.startedAtMs;
    run.process = undefined;
    this.append(run, 'system', `Finished with status ${status}${exitCode === null ? '' : ` and exit code ${exitCode}`}.`);
  }

  private terminate(child: ChildProcessWithoutNullStreams) {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      return;
    }

    child.kill('SIGTERM');
  }

  private append(run: MutableQaRun, stream: QaRunStream, message: string) {
    const cleaned = stripAnsi(message).replace(/\r\n/g, '\n');
    const output = stream === 'system' && !cleaned.endsWith('\n') ? `${cleaned}\n` : cleaned;
    run.logs.push({ at: new Date().toISOString(), stream, message: output });
    run.output = `${run.output}${output}`;

    if (run.output.length > MAX_OUTPUT_CHARS) {
      run.output = run.output.slice(run.output.length - MAX_OUTPUT_CHARS);
    }

    if (run.logs.length > 500) {
      run.logs.splice(0, run.logs.length - 500);
    }
  }

  private getAvailability(script: QaScriptDefinition) {
    if (!existsSync(script.cwd)) {
      return { available: false, reason: `${script.scope} workspace was not found at ${script.cwd}.` };
    }

    if (!existsSync(resolve(script.cwd, 'package.json'))) {
      return { available: false, reason: `No package.json exists in ${script.cwd}.` };
    }

    return { available: true as const };
  }

  private commandFor(script: QaScriptDefinition) {
    return ['npm run', script.npmScript, ...(script.npmArgs ?? [])].join(' ');
  }

  private findLastRun(scriptId: string) {
    const runId = this.runOrder.find((candidateId) => this.runs.get(candidateId)?.scriptId === scriptId);
    const run = runId ? this.runs.get(runId) : undefined;
    return run ? this.toListItem(run) : undefined;
  }

  private trimRuns() {
    while (this.runOrder.length > MAX_RUNS) {
      const runId = this.runOrder.pop();
      if (runId) this.runs.delete(runId);
    }
  }

  private toListItem(run: MutableQaRun): QaRunListItem {
    return {
      id: run.id,
      scriptId: run.scriptId,
      scriptName: run.scriptName,
      status: run.status,
      exitCode: run.exitCode,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs: run.durationMs,
      actorEmail: run.actorEmail,
      actorRoles: run.actorRoles,
      command: run.command,
      scope: run.scope,
      category: run.category,
      notes: run.notes,
    };
  }

  private toDetail(run: MutableQaRun): QaRunDetail {
    return {
      ...this.toListItem(run),
      output: run.output,
      logs: run.logs,
    };
  }
}

function stripAnsi(value: string) {
  return value.replace(ANSI_ESCAPE_PATTERN, '');
}
