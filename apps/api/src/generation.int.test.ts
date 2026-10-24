import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashToken, PrismaGenerationQueue } from '@classorganizer/infrastructure';
import { outcomeOf, type Role } from '@classorganizer/core';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../packages/infrastructure/src/testing/postgres-container.ts';
import { createSecureApp } from './secure-app.ts';
import {
  generationDetailSchema,
  generationListSchema,
  generationRunSchema,
  gridResultSchema,
  gridViewSchema,
  planningDetailSchema,
} from '@classorganizer/contracts';

const client = { 'x-entreaulas-client': 'web' };

describe('E6: geração automática pela API no PostgreSQL', () => {
  let testDb: TestDatabase;
  let app: ReturnType<typeof createSecureApp>;
  let queue: PrismaGenerationQueue;
  let editorCookie: string;
  let viewerCookie: string;
  let ids: { teacher: string; periods: string[]; block: string };
  let planningId: string;
  let revisionId: string;
  let version: number;

  async function seed(role: Role) {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    await testDb.db.appUser.create({
      data: { id, username: role + '-geracao', role, passwordHash: 'x', createdAt: new Date() },
    });
    await testDb.db.loginSession.create({
      data: { tokenHash: hashToken(token), userId: id, expiresAt: new Date(Date.now() + 60_000) },
    });
    return 'entreaulas_session=' + token;
  }
  async function call(
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    payload?: object,
    cookie = editorCookie,
  ) {
    return app.inject({
      method,
      url: '/api/v1/' + url,
      headers: { ...client, cookie },
      ...(payload ? { payload } : {}),
    });
  }
  async function ok(method: 'POST' | 'PUT', url: string, payload: object) {
    const response = await call(method, url, payload);
    expect(response.statusCode, response.body).toBeLessThan(300);
    return response.json() as { id: string; version: number; periods?: { id: string }[] };
  }
  const base = () => 'plannings/' + planningId + '/generations';
  async function request() {
    const response = await call('POST', base(), { version, revisionId });
    expect(response.statusCode, response.body).toBe(201);
    return generationRunSchema.parse(response.json());
  }
  async function detail(runId: string) {
    const response = await call('GET', base() + '/' + runId, undefined, viewerCookie);
    expect(response.statusCode, response.body).toBe(200);
    return generationDetailSchema.parse(response.json());
  }
  /** Faz o papel do worker: reserva a execução e devolve a grade indicada como viável. */
  async function solve(lessons: [number, number][], planning: [number, number]) {
    const claimed = await queue.claim('worker-teste', 30000, 3);
    if (!claimed) throw new Error('Nada na fila.');
    const day = (value: number) => value as 1 | 2 | 3 | 4 | 5;
    const proposal = {
      lessons: lessons.map(([weekday, period]) => ({
        assignmentId: ids.block,
        weekday: day(weekday),
        periodId: ids.periods[period] ?? '',
      })),
      planning: [
        {
          teacherId: ids.teacher,
          weekday: day(planning[0]),
          periodId: ids.periods[planning[1]] ?? '',
        },
      ],
    };
    const result = {
      status: 'feasible' as const,
      reason: 'solved',
      proposal,
      diagnostics: [],
      warnings: [],
      sourceRevision: revisionId,
      teacherIdleMinutes: 0,
      elapsedMs: 12.4,
      visitedNodes: 5,
      backtracks: 0,
      restarts: 0,
    };
    expect(
      await queue.finish(claimed.id, 'worker-teste', outcomeOf(claimed.snapshot, result)),
    ).toBe(true);
    return claimed;
  }

  beforeAll(async () => {
    testDb = await startTestDatabase();
    queue = new PrismaGenerationQueue(testDb.db);
  });
  beforeEach(async () => {
    await testDb.truncateAll();
    await seed('admin');
    editorCookie = await seed('editor');
    viewerCookie = await seed('viewer');
    app = createSecureApp(testDb.db, {
      logger: false,
      origin: 'http://localhost:8080',
      generation: { timeLimitMs: 5000, nodeLimit: 100000, memoryLimitMb: 64 },
    });
    const subject = await ok('POST', 'subjects', { name: 'Disciplina fictícia' });
    const teacher = await ok('POST', 'teachers', {
      name: 'Docente fictício',
      subjectIds: [subject.id],
      planningPeriods: 1,
    });
    const shift = await ok('POST', 'shifts', {
      name: 'Turno fictício',
      periods: [
        { start: '07:00', end: '07:50' },
        { start: '07:50', end: '08:40' },
      ],
    });
    const periods = (shift.periods ?? []).map((p) => p.id);
    const classGroup = await ok('POST', 'class-groups', { name: 'Turma fictícia' });
    await ok('PUT', 'class-groups/' + classGroup.id + '/schedule', {
      shiftId: shift.id,
      periodIds: periods,
      version: classGroup.version,
    });
    const block = await ok('POST', 'assignments', {
      classGroupId: classGroup.id,
      participants: [{ teacherId: teacher.id, subjectId: subject.id }],
      weeklyLessons: 2,
    });
    ids = { teacher: teacher.id, periods, block: block.id };
    const created = await ok('POST', 'plannings', { name: 'Plano fictício', year: 2027 });
    planningId = created.id;
    version = created.version;
    const planning = planningDetailSchema.parse(
      (await call('GET', 'plannings/' + planningId)).json(),
    );
    revisionId = planning.revisions[0]?.id ?? '';
  });
  afterEach(async () => {
    await app?.close();
  });
  afterAll(async () => {
    await testDb?.stop();
  });

  it('consulta acompanha; solicitar exige edição, versão atual e uma execução por vez', async () => {
    expect((await call('POST', base(), { version, revisionId }, viewerCookie)).statusCode).toBe(
      403,
    );
    const run = await request();
    expect(run).toMatchObject({
      status: 'queued',
      requestedBy: 'editor-geracao',
      options: { timeLimitMs: 5000, nodeLimit: 100000, memoryLimitMb: 64 },
      stale: false,
    });
    const again = await call('POST', base(), { version, revisionId });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: { code: 'generation.active' } });
    const list = generationListSchema.parse(
      (await call('GET', base(), undefined, viewerCookie)).json(),
    );
    expect(list).toMatchObject({ revisionId, editable: true, active: { id: run.id } });
    expect(
      (await call('POST', base() + '/' + run.id + '/cancel', {}, viewerCookie)).statusCode,
    ).toBe(403);
    const cancelled = await call('POST', base() + '/' + run.id + '/cancel', {});
    expect(generationRunSchema.parse(cancelled.json()).status).toBe('cancelled');
    expect((await call('POST', base() + '/' + run.id + '/cancel', {})).statusCode).toBe(409);
    expect((await call('POST', base(), { version: version + 5, revisionId })).statusCode).toBe(409);
  });

  it('compara, aplica de uma vez, registra histórico e auditoria e recusa repetir', async () => {
    const run = await request();
    await solve(
      [
        [1, 0],
        [2, 0],
      ],
      [3, 1],
    );
    const result = await detail(run.id);
    expect(result).toMatchObject({
      applicable: true,
      run: { status: 'feasible', metrics: { elapsedMs: 12 }, stale: false, attempts: 1 },
      comparison: { kept: 0, added: 3, removed: 0 },
    });
    expect(result.comparison?.diagnosis.pending).toEqual([]);
    expect(
      (await call('POST', base() + '/' + run.id + '/apply', { version, revisionId }, viewerCookie))
        .statusCode,
    ).toBe(403);
    const applied = await call('POST', base() + '/' + run.id + '/apply', { version, revisionId });
    expect(applied.statusCode, applied.body).toBe(200);
    const next = gridResultSchema.parse(applied.json()).version;
    expect(next).toBe(version + 1);
    const repeated = await call('POST', base() + '/' + run.id + '/apply', {
      version: next,
      revisionId,
    });
    expect(repeated.json()).toMatchObject({ error: { code: 'generation.applied' } });

    const grid = gridViewSchema.parse(
      (await call('GET', 'plannings/' + planningId + '/grid')).json(),
    );
    expect(grid.placements).toHaveLength(3);
    expect(grid.diagnosis.pending).toEqual([]);
    expect(grid.history).toEqual([expect.objectContaining({ kind: 'generation' })]);
    expect((await detail(run.id)).run.appliedBy).toBe('editor-geracao');
    const actions = (await testDb.db.auditEvent.findMany()).map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(['planning.generationRequest', 'planning.generationApply']),
    );
    const undo = await call('POST', 'plannings/' + planningId + '/grid/undo', {
      version: next,
      revisionId,
    });
    expect(undo.statusCode, undo.body).toBe(200);
  });

  it('recusa aplicar quando as fixações mudaram ou a proposta não passa na conferência', async () => {
    const stale = await request();
    await solve(
      [
        [1, 0],
        [2, 0],
      ],
      [3, 1],
    );
    const slot = { kind: 'lesson', entityId: ids.block, weekday: 5, periodId: ids.periods[1] };
    for (const operation of [
      { type: 'place', slot },
      { type: 'pin', slot, pinned: true },
    ]) {
      const response = await call('POST', 'plannings/' + planningId + '/grid/operations', {
        version,
        revisionId,
        operation,
      });
      expect(response.statusCode, response.body).toBe(200);
      version = gridResultSchema.parse(response.json()).version;
    }
    expect((await detail(stale.id)).run.stale).toBe(true);
    const refused = await call('POST', base() + '/' + stale.id + '/apply', { version, revisionId });
    expect(refused.json()).toMatchObject({ error: { code: 'generation.stale' } });

    // O "worker" ignora a fixação e põe a hora-atividade no horário de uma aula.
    const invalid = await request();
    await solve(
      [
        [1, 0],
        [5, 1],
      ],
      [1, 0],
    );
    const rejected = await call('POST', base() + '/' + invalid.id + '/apply', {
      version,
      revisionId,
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json()).toMatchObject({ error: { code: 'generation.invalid' } });
    const grid = gridViewSchema.parse(
      (await call('GET', 'plannings/' + planningId + '/grid')).json(),
    );
    expect(grid.placements).toHaveLength(1);
  });

  it('não expõe execuções de outro planejamento nem identificadores inválidos', async () => {
    const run = await request();
    const other = await ok('POST', 'plannings', { name: 'Outro plano', year: 2027 });
    expect((await call('GET', 'plannings/' + other.id + '/generations/' + run.id)).statusCode).toBe(
      404,
    );
    expect((await call('GET', base() + '/nao-e-uuid')).statusCode).toBe(400);
  });
});
