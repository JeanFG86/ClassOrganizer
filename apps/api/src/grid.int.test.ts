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
  revisionComparisonSchema,
  revisionRestoreResultSchema,
  timetableReportSchema,
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

  it('exporta XLSX para todos os perfis sem alterar versão, histórico ou auditoria', async () => {
    await operate({ type: 'place', slot: lesson(1, 0) });
    const before = await view();
    const auditCount = await testDb.db.auditEvent.count();
    const path = `plannings/${planningId}/workbook?revisionId=${revisionId}&version=${version}`;
    for (const cookie of [viewerCookie, editorCookie, adminCookie]) {
      const response = await call('GET', path, undefined, cookie);
      expect(response.statusCode, response.body.slice(0, 100)).toBe(200);
      expect(response.headers['content-type']).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(response.headers['content-disposition']).toContain('-revisao-1-v' + version + '.xlsx');
      expect(response.headers['cache-control']).toBe('no-store');
      expect([...response.rawPayload.subarray(0, 4)]).toEqual([80, 75, 3, 4]);
    }
    expect((await call('GET', path, undefined, '')).statusCode).toBe(401);
    expect((await call('GET', path.replace(`version=${version}`, 'version=1'))).statusCode).toBe(
      409,
    );
    expect((await call('GET', path.replace(revisionId, randomUUID()))).statusCode).toBe(404);
    expect(await testDb.db.auditEvent.count()).toBe(auditCount);
    expect(await view()).toEqual(before);
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
  it('E7: nomeia revisão concluída, compara e restaura com fotografia e fixações originais', async () => {
    await operate({ type: 'place', slot: lesson(1, 0) });
    await operate({ type: 'place', slot: lesson(2, 0) });
    await operate({ type: 'place', slot: planning(3, 1) });
    await operate({ type: 'pin', slot: lesson(1, 0), pinned: true });
    const originalGrid = await view();
    const firstId = revisionId;
    for (const operation of ['review', 'seal', 'draft']) {
      const response = await call('PUT', 'plannings/' + planningId, {
        version,
        revisionId,
        operation,
        rulesReviewed: true,
        availabilityReviewed: true,
      });
      expect(response.statusCode, response.body).toBe(200);
      version++;
    }
    const second = await view();
    revisionId = second.revision.id;
    const nameResponse = await call('PUT', `plannings/${planningId}/revisions/${firstId}/name`, {
      version,
      name: 'Grade aprovada',
    });
    expect(nameResponse.statusCode, nameResponse.body).toBe(200);
    version++;
    // Nem mesmo uma gravação direta pode reabrir ou mudar o conteúdo concluído.
    await expect(
      testDb.db.planningRevision.update({ where: { id: firstId }, data: { sealedAt: null } }),
    ).rejects.toThrow(/imutável/);
    await expect(
      testDb.db.planningRevision.update({ where: { id: firstId }, data: { rulesReviewed: false } }),
    ).rejects.toThrow(/imutável/);
    await expect(
      testDb.db.planningRevision.update({ where: { id: firstId }, data: { name: ' ' } }),
    ).rejects.toThrow(/name_not_blank/);
    await operate({ type: 'remove', slot: lesson(2, 0) });
    const comparisonResponse = await call(
      'GET',
      `plannings/${planningId}/revisions/comparison?fromRevisionId=${firstId}&toRevisionId=${revisionId}`,
      undefined,
      viewerCookie,
    );
    expect(comparisonResponse.statusCode, comparisonResponse.body).toBe(200);
    expect(revisionComparisonSchema.parse(comparisonResponse.json())).toMatchObject({
      kept: 2,
      removed: [expect.objectContaining({ pinned: false })],
      added: [],
      rulesChanged: false,
    });
    const old = await testDb.db.planningRevision.findMany({
      where: { planningId },
      orderBy: { number: 'asc' },
    });
    const auditCount = await testDb.db.auditEvent.count();
    const restoreUrl = `plannings/${planningId}/revisions/${firstId}/restore`;
    expect((await call('POST', restoreUrl, { version }, viewerCookie)).statusCode).toBe(403);
    expect((await call('POST', restoreUrl, { version: version - 1 })).statusCode).toBe(409);
    expect(await testDb.db.auditEvent.count()).toBe(auditCount);
    const restoredResponse = await call('POST', restoreUrl, { version });
    expect(restoredResponse.statusCode, restoredResponse.body).toBe(201);
    const result = revisionRestoreResultSchema.parse(restoredResponse.json());
    const restoredGrid = await view();
    expect(result.version).toBe(version + 1);
    expect(restoredGrid.placements).toEqual(originalGrid.placements);
    expect(restoredGrid.history).toEqual([
      expect.objectContaining({ kind: 'import', sequence: 1 }),
    ]);
    const rows = await testDb.db.planningRevision.findMany({
      where: { planningId },
      orderBy: { number: 'asc' },
    });
    expect(rows.slice(0, 2)).toEqual(old);
    expect(rows[2]).toMatchObject({
      snapshot: old[0]?.snapshot,
      gridRules: old[0]?.gridRules,
      restoredFromId: firstId,
      rulesReviewed: false,
      availabilityReviewed: false,
      sealedAt: null,
    });
    // O rascunho substituído permanece consultável, mas não editável.
    expect(
      (await call('GET', `plannings/${planningId}/grid?revisionId=${revisionId}`)).json(),
    ).toMatchObject({ editable: false });
    expect(
      await testDb.db.auditEvent.count({
        where: { action: 'planning.revisionRestore', entityId: planningId },
      }),
    ).toBe(1);
    await expect(
      testDb.db.planningRevision.update({
        where: { id: result.revisionId },
        data: { restoredFromId: revisionId },
      }),
    ).rejects.toThrow(/imutável/);
  });

  it('E7: falha no histórico reverte restauração, versão, alocações e auditoria na mesma transação', async () => {
    const source = await testDb.db.planningRevision.findUniqueOrThrow({
      where: { id: revisionId },
    });
    const preserveUrl = `plannings/${planningId}/revisions/${source.id}/preserve`;
    expect((await call('POST', preserveUrl, { version }, viewerCookie)).statusCode).toBe(403);
    const preserved = await call('POST', preserveUrl, { version });
    expect(preserved.statusCode, preserved.body).toBe(201);
    version = revisionRestoreResultSchema.parse(preserved.json()).version;
    // O banco protege o rascunho preservado mesmo sem conclusão formal.
    await expect(
      testDb.db.planningRevision.update({
        where: { id: source.id },
        data: { rulesReviewed: true },
      }),
    ).rejects.toThrow(/imutável/);
    await expect(
      testDb.db.timetablePlacement.create({
        data: { revisionId: source.id, ...lesson(1, 0), pinned: false },
      }),
    ).rejects.toThrow(/imutável/);
    expect((await call('POST', preserveUrl, { version })).statusCode).toBe(409);
    const before = await testDb.db.planning.findUniqueOrThrow({ where: { id: planningId } });
    const audits = await testDb.db.auditEvent.count();
    await testDb.db.$executeRawUnsafe(
      `CREATE FUNCTION reject_restore_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Falha simulada de histórico'; END; $$`,
    );
    await testDb.db.$executeRawUnsafe(
      'CREATE TRIGGER reject_restore_history BEFORE INSERT ON timetable_change FOR EACH ROW EXECUTE FUNCTION reject_restore_history()',
    );
    try {
      const response = await call(
        'POST',
        `plannings/${planningId}/revisions/${revisionId}/restore`,
        { version },
      );
      expect(response.statusCode).toBe(500);
      expect(await testDb.db.planning.findUniqueOrThrow({ where: { id: planningId } })).toEqual(
        before,
      );
      expect(await testDb.db.planningRevision.count()).toBe(2);
      expect(await testDb.db.timetablePlacement.count()).toBe(0);
      expect(await testDb.db.auditEvent.count()).toBe(audits);
    } finally {
      await testDb.db.$executeRawUnsafe('DROP TRIGGER reject_restore_history ON timetable_change');
      await testDb.db.$executeRawUnsafe('DROP FUNCTION reject_restore_history()');
    }
  });

  it('impressão por consulta mantém nomes, horários e alocações históricos, sem escrever', async () => {
    await operate({ type: 'place', slot: lesson(1, 0) });
    await operate({ type: 'pin', slot: lesson(1, 0), pinned: true });
    const auditCount = await testDb.db.auditEvent.count();
    const reportUrl = `plannings/${planningId}/report?revisionId=${revisionId}&perspective=class&entityId=${ids.classGroup}`;
    const response = await call('GET', reportUrl, undefined, viewerCookie);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const report = timetableReportSchema.parse(response.json());
    expect(report.sheets).toHaveLength(1);
    expect(report.sheets[0]?.rows[0]?.cells[0]?.items).toEqual([
      expect.objectContaining({
        title: 'Disciplina fictícia',
        details: ['Docente fictício'],
        pinned: true,
      }),
    ]);
    const teacher = await testDb.db.teacher.findUniqueOrThrow({ where: { id: ids.teacher } });
    await ok('PUT', `teachers/${ids.teacher}`, {
      name: 'Docente renomeado',
      subjectIds: [ids.subject],
      planningPeriods: 1,
      maxWeeklyLessons: null,
      version: teacher.version,
    });
    const historical = timetableReportSchema.parse(
      (await call('GET', reportUrl, undefined, viewerCookie)).json(),
    );
    expect(historical.sheets).toEqual(report.sheets);
    const teacherReport = await call(
      'GET',
      `plannings/${planningId}/report?revisionId=${revisionId}&perspective=teacher&entityId=${ids.teacher}`,
      undefined,
      viewerCookie,
    );
    expect(timetableReportSchema.parse(teacherReport.json()).sheets[0]?.targetName).toBe(
      'Docente fictício',
    );
    expect(await testDb.db.auditEvent.count()).toBe(auditCount + 1);
    expect(
      (
        await call(
          'GET',
          `plannings/${planningId}/report?revisionId=${randomUUID()}&perspective=class`,
          undefined,
          viewerCookie,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await call(
          'GET',
          `plannings/${planningId}/report?revisionId=${revisionId}&perspective=class&entityId=${ids.teacher}`,
          undefined,
          viewerCookie,
        )
      ).statusCode,
    ).toBe(404);
    expect((await call('GET', reportUrl, undefined, '')).statusCode).toBe(401);
  });

  it('E7: a origem da restauração deve pertencer ao mesmo planejamento também no banco', async () => {
    const source = await testDb.db.planningRevision.findUniqueOrThrow({
      where: { id: revisionId },
    });
    const other = await ok('POST', 'plannings', { name: 'Outro plano inventado', year: 2028 });
    await expect(
      testDb.db.planningRevision.create({
        data: {
          ...source,
          snapshot: source.snapshot ?? {},
          gridRules: source.gridRules ?? {},
          id: randomUUID(),
          number: 2,
          planningId: other.id,
          restoredFromId: source.id,
        },
      }),
    ).rejects.toThrow();
    expect(
      (
        await call('POST', `plannings/${other.id}/revisions/${source.id}/restore`, {
          version: other.version,
        })
      ).statusCode,
    ).toBe(404);
  });
});
