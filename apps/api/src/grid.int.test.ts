import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '@classorganizer/infrastructure';
import type { Role } from '@classorganizer/core';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../packages/infrastructure/src/testing/postgres-container.ts';
import { createSecureApp } from './secure-app.ts';
import {
  gridEvaluationSchema,
  gridResultSchema,
  gridViewSchema,
  planningDetailSchema,
  type GridOperationDto,
  type GridSlotDto,
} from '@classorganizer/contracts';

const client = { 'x-entreaulas-client': 'web' };
type Weekday = GridSlotDto['weekday'];

describe('E5: grade manual pela API no PostgreSQL', () => {
  let testDb: TestDatabase;
  let app: ReturnType<typeof createSecureApp>;
  let editorCookie: string;
  let viewerCookie: string;
  let adminCookie: string;
  let ids: {
    subject: string;
    teacher: string;
    periods: string[];
    classGroup: string;
    block: string;
  };
  let planningId: string;
  let revisionId: string;
  let version: number;

  async function seed(role: Role) {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    await testDb.db.appUser.create({
      data: { id, username: role + '-grade', role, passwordHash: 'x', createdAt: new Date() },
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
  const lesson = (weekday: Weekday, period: number): GridSlotDto => ({
    kind: 'lesson',
    entityId: ids.block,
    weekday,
    periodId: ids.periods[period] ?? '',
  });
  const planning = (weekday: Weekday, period: number): GridSlotDto => ({
    kind: 'planning',
    entityId: ids.teacher,
    weekday,
    periodId: ids.periods[period] ?? '',
  });
  async function operate(operation: GridOperationDto, expected = 200) {
    const response = await call('POST', 'plannings/' + planningId + '/grid/operations', {
      version,
      revisionId,
      operation,
    });
    expect(response.statusCode, response.body).toBe(expected);
    if (expected === 200) version = gridResultSchema.parse(response.json()).version;
    return response;
  }
  async function view(cookie = editorCookie) {
    const response = await call('GET', 'plannings/' + planningId + '/grid', undefined, cookie);
    expect(response.statusCode, response.body).toBe(200);
    return gridViewSchema.parse(response.json());
  }

  beforeAll(async () => {
    testDb = await startTestDatabase();
  });
  beforeEach(async () => {
    await testDb.truncateAll();
    adminCookie = await seed('admin');
    editorCookie = await seed('editor');
    viewerCookie = await seed('viewer');
    app = createSecureApp(testDb.db, { logger: false, origin: 'http://localhost:8080' });
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
    ids = {
      subject: subject.id,
      teacher: teacher.id,
      periods,
      classGroup: classGroup.id,
      block: block.id,
    };
    const created = await ok('POST', 'plannings', { name: 'Plano fictício', year: 2027 });
    planningId = created.id;
    version = created.version;
    const detail = planningDetailSchema.parse(
      (await call('GET', 'plannings/' + planningId)).json(),
    );
    revisionId = detail.revisions[0]?.id ?? '';
  });
  afterEach(async () => {
    await app?.close();
  });
  afterAll(async () => {
    await testDb?.stop();
  });

  it('consulta lê a grade; prévia e operações exigem perfil de edição', async () => {
    const grid = await view(viewerCookie);
    expect(grid.editable).toBe(true);
    expect(grid.diagnosis.pending.map((i) => i.code)).toEqual(['load.lessons', 'load.planning']);
    for (const path of ['preview', 'operations'])
      expect(
        (
          await call(
            'POST',
            'plannings/' + planningId + '/grid/' + path,
            { version, revisionId, operation: { type: 'place', slot: lesson(1, 0) } },
            viewerCookie,
          )
        ).statusCode,
      ).toBe(403);
    expect(
      (
        await call(
          'POST',
          'plannings/' + planningId + '/grid/undo',
          { version, revisionId },
          viewerCookie,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call('POST', 'plannings/' + planningId + '/grid/operations', {
          version,
          revisionId,
          operation: { type: 'place', slot: { ...lesson(1, 0), weekday: 6 } },
        })
      ).statusCode,
    ).toBe(400);
  });

  it('prévia não grava; operações versionam, auditam e a conclusão exige grade completa', async () => {
    const preview = await call('POST', 'plannings/' + planningId + '/grid/preview', {
      version,
      revisionId,
      operation: { type: 'place', slot: lesson(1, 0) },
    });
    expect(gridEvaluationSchema.parse(preview.json())).toMatchObject({ accepted: true });
    expect(await testDb.db.timetablePlacement.count()).toBe(0);
    expect(await testDb.db.auditEvent.count({ where: { action: 'planning.grid' } })).toBe(0);
    await operate({ type: 'place', slot: lesson(1, 0) });
    await call('PUT', 'plannings/' + planningId, {
      version,
      revisionId,
      operation: 'review',
      rulesReviewed: true,
      availabilityReviewed: true,
    });
    version++;
    const blocked = await call('PUT', 'plannings/' + planningId, {
      version,
      revisionId,
      operation: 'seal',
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ error: { code: 'planning.grid_incomplete' } });
    await operate({ type: 'place', slot: lesson(2, 0) });
    await operate({ type: 'place', slot: planning(3, 1) });
    const grid = await view();
    expect(grid.diagnosis.pending).toEqual([]);
    expect(grid.history.map((c) => c.sequence)).toEqual([1, 2, 3]);
    expect(
      await testDb.db.auditEvent.count({
        where: { action: 'planning.grid', entityId: planningId },
      }),
    ).toBe(3);
    const sealed = await call('PUT', 'plannings/' + planningId, {
      version,
      revisionId,
      operation: 'seal',
    });
    expect(sealed.statusCode, sealed.body).toBe(200);
    version++;
    await operate({ type: 'remove', slot: lesson(1, 0) }, 409);
    // O banco também recusa alterar a grade concluída fora do caso de uso.
    await expect(
      testDb.db.timetablePlacement.deleteMany({ where: { revisionId } }),
    ).rejects.toThrow(/imutável/);
    const draft = await call('PUT', 'plannings/' + planningId, {
      version,
      revisionId,
      operation: 'draft',
    });
    expect(draft.statusCode, draft.body).toBe(200);
    const next = await view();
    expect(next.revision.number).toBe(2);
    expect(next.placements).toHaveLength(3);
    expect(next.history).toEqual([
      expect.objectContaining({
        kind: 'import',
        summary: expect.stringContaining('3 alocações mantidas'),
      }),
    ]);
  });

  it('operação rejeitada não grava nada e versão antiga recebe 409', async () => {
    await operate({ type: 'place', slot: lesson(1, 0) });
    const audits = await testDb.db.auditEvent.count();
    // A hora-atividade no mesmo horário colide com a aula do próprio professor.
    const rejected = await operate({ type: 'place', slot: planning(1, 0) }, 409);
    expect(rejected.json()).toMatchObject({ error: { code: 'grid.rejected' } });
    expect(await testDb.db.timetablePlacement.count()).toBe(1);
    expect(await testDb.db.auditEvent.count()).toBe(audits);
    const stale = await call('POST', 'plannings/' + planningId + '/grid/operations', {
      version: version - 1,
      revisionId,
      operation: { type: 'place', slot: lesson(2, 0) },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: { code: 'concurrency.stale' } });
    expect(await testDb.db.timetablePlacement.count()).toBe(1);
  });

  it('troca, fixação, desfazer e regras pela API', async () => {
    await operate({ type: 'place', slot: lesson(1, 0) });
    await operate({ type: 'place', slot: planning(2, 1) });
    await operate({ type: 'swap', first: lesson(1, 0), second: planning(2, 1) });
    expect((await view()).placements).toEqual(
      expect.arrayContaining([
        { ...lesson(2, 1), pinned: false },
        { ...planning(1, 0), pinned: false },
      ]),
    );
    await operate({ type: 'pin', slot: lesson(2, 1), pinned: true });
    await operate(
      { type: 'move', slot: lesson(2, 1), weekday: 4, periodId: ids.periods[0] ?? '' },
      409,
    );
    const undo = await call('POST', 'plannings/' + planningId + '/grid/undo', {
      version,
      revisionId,
    });
    expect(undo.statusCode, undo.body).toBe(200);
    version = gridResultSchema.parse(undo.json()).version;
    const afterUndo = await view();
    expect(afterUndo.placements).toContainEqual({ ...lesson(2, 1), pinned: false });
    expect(afterUndo.undo?.summary).toMatch(/^Trocou/);
    const rules = await call('PUT', 'plannings/' + planningId + '/grid/rules', {
      version,
      revisionId,
      rules: {
        ...afterUndo.rules,
        dailyExceptions: [
          {
            classGroupId: ids.classGroup,
            subjectId: ids.subject,
            maxPerDay: 1,
            consecutive: false,
          },
        ],
      },
    });
    expect(rules.statusCode, rules.body).toBe(200);
    const changed = await view();
    expect(changed.rules.dailyExceptions).toHaveLength(1);
    expect(changed.revision.rulesReviewed).toBe(false);
    expect(
      await testDb.db.auditEvent.findMany({
        select: { action: true },
        orderBy: { occurredAt: 'asc' },
      }),
    ).toEqual(
      expect.arrayContaining([{ action: 'planning.gridUndo' }, { action: 'planning.gridRules' }]),
    );
    expect((await call('GET', 'audit', undefined, adminCookie)).statusCode).toBe(200);
  });
});
