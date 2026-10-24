import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  validateTimetableProposal,
  type GenerationResult,
  type NewGenerationRun,
  type TimetableSnapshot,
} from '@classorganizer/core';
import { makeTimetableFixture } from '@classorganizer/core/testing';
import {
  PrismaGenerationQueue,
  PrismaGenerationRunRepository,
} from '@classorganizer/infrastructure';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../../packages/infrastructure/src/testing/postgres-container.ts';
import { GenerationConsumer, type QueueRunnerOptions } from './generation-consumer.ts';
import { runGeneration } from '../generation/thread-runner.ts';

const at = new Date('2026-02-01T12:00:00.000Z');
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLANNING = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REVISION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const RUN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const options: QueueRunnerOptions = {
  workerId: 'worker-test',
  leaseMs: 5000,
  heartbeatMs: 30,
  pollMs: 20,
  maxAttempts: 3,
};
const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };
const run: NewGenerationRun = {
  id: RUN,
  planningId: PLANNING,
  revisionId: REVISION,
  requestedBy: USER,
  requestedAt: at,
  status: 'queued',
  options: { timeLimitMs: 5000, nodeLimit: 200000, seed: 7, memoryLimitMb: 64, preferences: [] },
  inputDigest: 'a'.repeat(64),
  attempts: 0,
  cancelRequestedAt: null,
  appliedAt: null,
};
/** Busca falsa que só termina quando é interrompida. */
function waitForAbort(started: () => void) {
  return (_snapshot: TimetableSnapshot, _options: unknown, signal?: AbortSignal) =>
    new Promise<GenerationResult>((resolve) => {
      started();
      signal?.addEventListener('abort', () =>
        resolve({
          status: 'cancelled',
          reason: 'cancelled',
          proposal: null,
          diagnostics: [],
          warnings: [],
          sourceRevision: REVISION,
          teacherIdleMinutes: null,
          preferences: null,
          elapsedMs: 1,
          visitedNodes: 0,
          backtracks: 0,
          restarts: 0,
        }),
      );
    });
}
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await sleep(20);
  }
  throw new Error('Condição não atingida a tempo.');
}

describe('worker consumindo a fila de geração (PostgreSQL)', () => {
  let testDb: TestDatabase;
  let runs: PrismaGenerationRunRepository;
  let queue: PrismaGenerationQueue;
  let snapshot: TimetableSnapshot;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    runs = new PrismaGenerationRunRepository(testDb.db);
    queue = new PrismaGenerationQueue(testDb.db);
  });
  afterAll(async () => {
    await testDb?.stop();
  });
  beforeEach(async () => {
    await testDb.truncateAll();
    await testDb.db.appUser.create({
      data: { id: USER, username: 'editor-test', role: 'editor', passwordHash: 'x', createdAt: at },
    });
    await testDb.db.planning.create({
      data: { id: PLANNING, name: 'Plano fictício', year: 2027, createdAt: at },
    });
    await testDb.db.planningRevision.create({
      data: {
        id: REVISION,
        planningId: PLANNING,
        number: 1,
        createdAt: at,
        createdBy: USER,
        snapshot: {
          formatVersion: 1,
          catalogVersion: 1,
          capturedAt: at.toISOString(),
          subjects: [],
          teachers: [],
          classGroups: [],
          shifts: [],
          assignments: [],
        },
      },
    });
    snapshot = makeTimetableFixture();
    await runs.add(run, snapshot);
  });

  it('executa a busca real em thread e grava a proposta conferida', async () => {
    const runner = new GenerationConsumer({
      queue,
      executor: { execute: runGeneration },
      logger: silent,
      options,
    });
    expect(await runner.processNext()).toBe(true);
    const stored = await runs.find(RUN);
    expect(stored).toMatchObject({ status: 'feasible', attempts: 1 });
    const placements = stored?.outcome?.placements ?? [];
    const proposal = {
      lessons: placements
        .filter((p) => p.kind === 'lesson')
        .map((p) => ({ assignmentId: p.entityId, weekday: p.weekday, periodId: p.periodId })),
      planning: placements
        .filter((p) => p.kind === 'planning')
        .map((p) => ({ teacherId: p.entityId, weekday: p.weekday, periodId: p.periodId })),
    };
    expect(validateTimetableProposal(snapshot, proposal)).toEqual([]);
    expect(await runner.processNext()).toBe(false);
  });

  it('retoma a execução de um worker interrompido sem duplicar o resultado', async () => {
    await queue.claim('worker-morto', 1, 3);
    await sleep(20);
    const runner = new GenerationConsumer({
      queue,
      executor: { execute: runGeneration },
      logger: silent,
      options,
    });
    expect(await runner.processNext()).toBe(true);
    const stored = await runs.find(RUN);
    expect(stored).toMatchObject({ status: 'feasible', attempts: 2 });
    if (!stored?.outcome) throw new Error('Resultado ausente.');
    expect(await queue.finish(RUN, 'worker-morto', stored.outcome)).toBe(false);
  });

  it('interrompe a busca quando a secretaria cancela', async () => {
    let started = false;
    const runner = new GenerationConsumer({
      queue,
      executor: { execute: waitForAbort(() => (started = true)) },
      logger: silent,
      options,
    });
    const processing = runner.processNext();
    await until(async () => started);
    await runs.cancel(RUN, at);
    await processing;
    expect(await runs.find(RUN)).toMatchObject({
      status: 'cancelled',
      finishedAt: expect.any(Date),
    });
  });

  it('devolve a execução à fila ao encerrar o worker', async () => {
    let started = false;
    const runner = new GenerationConsumer({
      queue,
      executor: { execute: waitForAbort(() => (started = true)) },
      logger: silent,
      options,
    });
    runner.start();
    await until(async () => started);
    await runner.stop();
    expect(await runs.find(RUN)).toMatchObject({ status: 'queued', attempts: 0 });
  });

  it('registra falha técnica quando a execução lança erro', async () => {
    const runner = new GenerationConsumer({
      queue,
      executor: { execute: () => Promise.reject(new Error('falha simulada')) },
      logger: silent,
      options,
    });
    await runner.processNext();
    expect(await runs.find(RUN)).toMatchObject({
      status: 'failed',
      outcome: { reason: 'worker_error', placements: null },
    });
  });
});
