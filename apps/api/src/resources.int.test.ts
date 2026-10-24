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
  assignmentListSchema,
  gridEvaluationSchema,
  gridResultSchema,
  gridViewSchema,
  planningDetailSchema,
  resourceListSchema,
  resourceSchema,
} from '@classorganizer/contracts';

const client = { 'x-entreaulas-client': 'web' };

describe('recursos especiais pela API no PostgreSQL', () => {
  let testDb: TestDatabase;
  let app: ReturnType<typeof createSecureApp>;
  let editorCookie: string;
  let viewerCookie: string;

  async function seed(role: Role) {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    await testDb.db.appUser.create({
      data: { id, username: role + '-recurso', role, passwordHash: 'x', createdAt: new Date() },
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
  async function planningRef(name: string) {
    const created = await ok('POST', 'plannings', { name, year: 2027 });
    const detail = planningDetailSchema.parse(
      (await call('GET', 'plannings/' + created.id)).json(),
    );
    return { id: created.id, version: created.version, revisionId: detail.revisions[0]?.id ?? '' };
  }

  beforeAll(async () => {
    testDb = await startTestDatabase();
  });
  beforeEach(async () => {
    await testDb.truncateAll();
    await seed('admin');
    editorCookie = await seed('editor');
    viewerCookie = await seed('viewer');
    app = createSecureApp(testDb.db, { logger: false, origin: 'http://localhost:8080' });
  });
  afterEach(async () => {
    await app?.close();
  });
  afterAll(async () => {
    await testDb?.stop();
  });

  it('cadastra com auditoria, reserva nos blocos e acusa dois blocos no mesmo horário', async () => {
    expect(
      (await call('POST', 'resources', { name: 'Laboratório fictício' }, viewerCookie)).statusCode,
    ).toBe(403);
    const lab = resourceSchema.parse(
      (await call('POST', 'resources', { name: 'Laboratório fictício' })).json(),
    );
    const repeated = await call('POST', 'resources', { name: 'laboratorio ficticio' });
    expect(repeated.json()).toMatchObject({ error: { code: 'resource.name_in_use' } });
    expect(
      await testDb.db.auditEvent.count({ where: { action: 'catalog.registerResource' } }),
    ).toBe(1);

    const subject = await ok('POST', 'subjects', { name: 'Disciplina fictícia' });
    const shift = await ok('POST', 'shifts', {
      name: 'Turno fictício',
      periods: [{ start: '07:00', end: '07:50' }],
    });
    const period = shift.periods?.[0]?.id ?? '';
    const blocks: string[] = [];
    let last = { classGroupId: '', teacherId: '' };
    for (const n of [1, 2]) {
      const teacher = await ok('POST', 'teachers', {
        name: 'Docente fictício ' + n,
        subjectIds: [subject.id],
      });
      const classGroup = await ok('POST', 'class-groups', { name: 'Turma fictícia ' + n });
      await ok('PUT', 'class-groups/' + classGroup.id + '/schedule', {
        shiftId: shift.id,
        periodIds: [period],
        version: classGroup.version,
      });
      const block = await ok('POST', 'assignments', {
        classGroupId: classGroup.id,
        participants: [{ teacherId: teacher.id, subjectId: subject.id }],
        weeklyLessons: 1,
        resourceIds: [lab.id],
      });
      blocks.push(block.id);
      last = { classGroupId: classGroup.id, teacherId: teacher.id };
    }
    const twice = await call('POST', 'assignments', {
      classGroupId: last.classGroupId,
      participants: [{ teacherId: last.teacherId, subjectId: subject.id }],
      weeklyLessons: 1,
      resourceIds: [lab.id, lab.id],
    });
    expect(twice.json()).toMatchObject({ error: { code: 'assignment.invalid_resources' } });
    const listed = assignmentListSchema.parse((await call('GET', 'assignments')).json());
    expect(listed.items.map((a) => a.resourceIds)).toEqual([[lab.id], [lab.id]]);

    const ref = await planningRef('Plano com recurso');
    const grid = gridViewSchema.parse((await call('GET', 'plannings/' + ref.id + '/grid')).json());
    expect(grid.timetable.resources).toEqual([{ id: lab.id, name: 'Laboratório fictício' }]);
    const slot = (block: string) => ({
      kind: 'lesson' as const,
      entityId: block,
      weekday: 1 as const,
      periodId: period,
    });
    const placed = await call('POST', 'plannings/' + ref.id + '/grid/operations', {
      version: ref.version,
      revisionId: ref.revisionId,
      operation: { type: 'place', slot: slot(blocks[0] ?? '') },
    });
    expect(placed.statusCode, placed.body).toBe(200);
    const preview = gridEvaluationSchema.parse(
      (
        await call('POST', 'plannings/' + ref.id + '/grid/preview', {
          version: gridResultSchema.parse(placed.json()).version,
          revisionId: ref.revisionId,
          operation: { type: 'place', slot: slot(blocks[1] ?? '') },
        })
      ).json(),
    );
    expect(preview.accepted).toBe(false);
    expect(preview.introduced.map((i) => i.code)).toEqual(['conflict.resource']);

    // Arquivado, o recurso deixa de reservar horários nas revisões novas.
    await ok('POST', 'resources/' + lab.id + '/archive', { version: lab.version });
    const listedResources = resourceListSchema.parse((await call('GET', 'resources')).json());
    expect(listedResources.items[0]?.archivedAt).not.toBeNull();
    const later = await planningRef('Plano sem recurso');
    const laterGrid = gridViewSchema.parse(
      (await call('GET', 'plannings/' + later.id + '/grid')).json(),
    );
    expect(laterGrid.timetable.resources).toEqual([]);
    expect(laterGrid.timetable.assignments.every((a) => a.resourceIds.length === 0)).toBe(true);
  });
});
