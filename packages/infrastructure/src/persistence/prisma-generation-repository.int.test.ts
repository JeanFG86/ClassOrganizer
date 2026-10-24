import { setTimeout as sleep } from 'node:timers/promises';
import type { GenerationOutcome, NewGenerationRun, TimetableSnapshot } from '@classorganizer/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDatabase } from '../testing/postgres-container.ts';
import type { TestDatabase } from '../testing/postgres-container.ts';
import {
  PrismaGenerationQueue,
  PrismaGenerationRunRepository,
} from './prisma-generation-repository.ts';

const at = new Date('2026-02-01T12:00:00.000Z');
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLANNING = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_PLANNING = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc';
const REVISION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_REVISION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccd';
const RUN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER_RUN = 'dddddddd-dddd-4ddd-8ddd-ddddddddddde';
const BLOCK = '10000000-0000-4000-8000-000000000001';
const PERIOD = '20000000-0000-4000-8000-000000000001';
const input = { modelVersion: 1, sourceRevision: REVISION } as unknown as TimetableSnapshot;
const run = (overrides: Partial<NewGenerationRun> = {}): NewGenerationRun => ({
  id: RUN,
  planningId: PLANNING,
  revisionId: REVISION,
  requestedBy: USER,
  requestedAt: at,
  status: 'queued',
  options: {
    timeLimitMs: 30000,
    nodeLimit: 2000000,
    seed: 11,
    memoryLimitMb: 256,
    preferences: ['teacher_windows'],
  },
  inputDigest: 'a'.repeat(64),
  attempts: 0,
  cancelRequestedAt: null,
  appliedAt: null,
  ...overrides,
});
const feasible: GenerationOutcome = {
  status: 'feasible',
  reason: 'solved',
  placements: [{ kind: 'lesson', entityId: BLOCK, weekday: 1, periodId: PERIOD, pinned: false }],
  diagnostics: [],
  warnings: [],
  metrics: {
    elapsedMs: 15,
    visitedNodes: 3,
    backtracks: 0,
    restarts: 0,
    preferences: { changes: 0, teacherWindows: 1, dailySpread: 0 },
  },
};

describe('execuções e fila da geração (PostgreSQL)', () => {
  let testDb: TestDatabase;
  let runs: PrismaGenerationRunRepository;
  let queue: PrismaGenerationQueue;

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
    for (const [planningId, revisionId] of [
      [PLANNING, REVISION],
      [OTHER_PLANNING, OTHER_REVISION],
    ] as const) {
      await testDb.db.planning.create({
        data: { id: planningId, name: 'Plano fictício', year: 2027, createdAt: at },
      });
      await testDb.db.planningRevision.create({
        data: {
          id: revisionId,
          planningId,
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
    }
  });
  const row = () => testDb.db.generationRun.findUniqueOrThrow({ where: { id: RUN } });

  it('grava a solicitação e aceita uma única execução ativa por planejamento', async () => {
    await runs.add(run(), input);
    expect(await runs.find(RUN)).toMatchObject({
      status: 'queued',
      requestedByUsername: 'editor-test',
      options: { seed: 11 },
      outcome: null,
    });
    expect((await runs.active(PLANNING))?.id).toBe(RUN);
    await expect(runs.add(run({ id: OTHER_RUN }), input)).rejects.toMatchObject({
      code: 'generation.active',
    });
    await runs.add(
      run({ id: OTHER_RUN, planningId: OTHER_PLANNING, revisionId: OTHER_REVISION }),
      input,
    );
    expect((await runs.list(REVISION, 20)).map((r) => r.id)).toEqual([RUN]);
  });

  it('lê execuções gravadas antes das preferências sem critérios nem métricas', async () => {
    const legacy: Record<string, unknown> = { ...run().options };
    delete legacy['preferences'];
    await runs.add({ ...run(), options: legacy as never }, input);
    const claimed = await queue.claim('worker-a', 30000, 3);
    expect(claimed?.options.preferences).toEqual([]);
    const metrics: Record<string, unknown> = { ...feasible.metrics };
    delete metrics['preferences'];
    await queue.finish(RUN, 'worker-a', { ...feasible, metrics: metrics as never });
    expect(await runs.find(RUN)).toMatchObject({
      options: { preferences: [] },
      outcome: { metrics: { preferences: null } },
    });
  });

  it('impede uma revisão de outro planejamento', async () => {
    await expect(runs.add(run({ revisionId: OTHER_REVISION }), input)).rejects.toThrow();
  });

  it('reserva, renova, termina e descarta resultados de quem perdeu a reserva', async () => {
    await runs.add(run(), input);
    const claimed = await queue.claim('worker-a', 30000, 3);
    expect(claimed).toMatchObject({ id: RUN, attempt: 1, snapshot: input, options: { seed: 11 } });
    expect(await queue.claim('worker-b', 30000, 3)).toBeNull();
    expect(await queue.heartbeat(RUN, 'worker-b', 30000)).toBeNull();
    expect(await queue.heartbeat(RUN, 'worker-a', 30000)).toEqual({ cancelRequested: false });
    expect(await queue.finish(RUN, 'worker-b', feasible)).toBe(false);
    expect(await queue.finish(RUN, 'worker-a', feasible)).toBe(true);
    expect(await queue.finish(RUN, 'worker-a', feasible)).toBe(false);
    expect(await runs.find(RUN)).toMatchObject({ status: 'feasible', outcome: feasible });
    expect(await runs.active(PLANNING)).toBeNull();
  });

  it('recupera a execução de um worker interrompido e conta as tentativas', async () => {
    await runs.add(run(), input);
    await queue.claim('worker-a', 1, 3);
    await sleep(20);
    expect(await queue.claim('worker-b', 30000, 3)).toMatchObject({ id: RUN, attempt: 2 });
    expect(await queue.heartbeat(RUN, 'worker-a', 30000)).toBeNull();
    expect(await queue.finish(RUN, 'worker-a', feasible)).toBe(false);
    expect(await queue.finish(RUN, 'worker-b', feasible)).toBe(true);
  });

  it('desiste depois do limite de tentativas sem repetir a busca', async () => {
    await runs.add(run(), input);
    await queue.claim('worker-a', 1, 1);
    await sleep(20);
    expect(await queue.claim('worker-b', 30000, 1)).toBeNull();
    expect(await runs.find(RUN)).toMatchObject({
      status: 'failed',
      outcome: { reason: 'abandoned', placements: null },
    });
  });

  it('cancela na fila na hora e, em execução, faz o cancelamento prevalecer', async () => {
    await runs.add(run(), input);
    await runs.cancel(RUN, at);
    expect(await runs.find(RUN)).toMatchObject({
      status: 'cancelled',
      outcome: { reason: 'cancelled' },
    });
    expect(await queue.claim('worker-a', 30000, 3)).toBeNull();

    await runs.add(run({ id: OTHER_RUN }), input);
    await queue.claim('worker-a', 30000, 3);
    await runs.cancel(OTHER_RUN, at);
    expect(await queue.heartbeat(OTHER_RUN, 'worker-a', 30000)).toEqual({ cancelRequested: true });
    expect(await queue.finish(OTHER_RUN, 'worker-a', feasible)).toBe(true);
    expect(await runs.find(OTHER_RUN)).toMatchObject({
      status: 'cancelled',
      outcome: { placements: null, metrics: feasible.metrics },
    });
  });

  it('devolve à fila no encerramento do worker sem consumir tentativa', async () => {
    await runs.add(run(), input);
    await queue.claim('worker-a', 30000, 3);
    await queue.release(RUN, 'worker-a');
    expect(await row()).toMatchObject({ status: 'queued', attempts: 0, leaseOwner: null });
    expect(await queue.claim('worker-b', 30000, 3)).toMatchObject({ attempt: 1 });
  });

  it('reserva execuções diferentes em paralelo', async () => {
    await runs.add(run(), input);
    await runs.add(
      run({ id: OTHER_RUN, planningId: OTHER_PLANNING, revisionId: OTHER_REVISION }),
      input,
    );
    const claimed = await Promise.all([
      queue.claim('worker-a', 30000, 3),
      queue.claim('worker-b', 30000, 3),
    ]);
    expect(claimed.map((c) => c?.id).toSorted()).toEqual([RUN, OTHER_RUN].toSorted());
  });

  it('marca a aplicação uma única vez e protege o resultado no banco', async () => {
    await runs.add(run(), input);
    expect(await runs.markApplied(RUN, USER, at)).toBe(false);
    await queue.claim('worker-a', 30000, 3);
    await queue.finish(RUN, 'worker-a', feasible);
    expect(await runs.markApplied(RUN, USER, at)).toBe(true);
    expect(await runs.markApplied(RUN, USER, at)).toBe(false);
    expect(await runs.find(RUN)).toMatchObject({ appliedByUsername: 'editor-test' });
    await expect(
      testDb.db.generationRun.update({ where: { id: RUN }, data: { status: 'failed' } }),
    ).rejects.toThrow();
    await expect(
      testDb.db.generationRun.update({ where: { id: RUN }, data: { inputDigest: 'b'.repeat(64) } }),
    ).rejects.toThrow();
    await expect(testDb.db.generationRun.delete({ where: { id: RUN } })).rejects.toThrow();
  });

  it('recusa estados incoerentes gravados direto no banco', async () => {
    await expect(
      testDb.db.generationRun.create({
        data: { ...run(), status: 'running', options: {}, input: {} },
      }),
    ).rejects.toThrow();
    await expect(
      testDb.db.generationRun.create({
        data: {
          ...run(),
          status: 'infeasible',
          options: {},
          input: {},
          result: {},
          finishedAt: at,
          appliedAt: at,
          appliedBy: USER,
        },
      }),
    ).rejects.toThrow();
  });

  it('aceita a aplicação no histórico da grade e o desfazer correspondente', async () => {
    const change = {
      revisionId: REVISION,
      actorId: USER,
      occurredAt: at,
      summary: 'Aplicou a geração automática.',
      delta: { removed: [], added: [] },
    };
    await testDb.db.timetableChange.create({
      data: { ...change, id: RUN, sequence: 1, kind: 'generation' },
    });
    await testDb.db.timetableChange.create({
      data: { ...change, id: OTHER_RUN, sequence: 2, kind: 'undo', revertsId: RUN },
    });
    expect(await testDb.db.timetableChange.count()).toBe(2);
  });
});
