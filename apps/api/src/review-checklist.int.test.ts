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
  REVIEW_ITEMS,
  planningDetailSchema,
  planningSchema,
  revisionChecklistSchema,
} from '@classorganizer/contracts';

const client = { 'x-entreaulas-client': 'web' };

describe('checklist de conferência e preparação do ano seguinte no PostgreSQL', () => {
  let testDb: TestDatabase;
  let app: ReturnType<typeof createSecureApp>;
  let editorCookie: string;
  let viewerCookie: string;

  async function seed(role: Role) {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    await testDb.db.appUser.create({
      data: { id, username: role + '-checklist', role, passwordHash: 'x', createdAt: new Date() },
    });
    await testDb.db.loginSession.create({
      data: { tokenHash: hashToken(token), userId: id, expiresAt: new Date(Date.now() + 60_000) },
    });
    return 'entreaulas_session=' + token;
  }
  function call(
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
  async function detail(id: string) {
    return planningDetailSchema.parse((await call('GET', 'plannings/' + id)).json());
  }
  async function checklist(id: string, revisionId: string, cookie = viewerCookie) {
    const response = await call(
      'GET',
      `plannings/${id}/revisions/${revisionId}/checklist`,
      undefined,
      cookie,
    );
    expect(response.statusCode, response.body).toBe(200);
    return revisionChecklistSchema.parse(response.json());
  }

  beforeAll(async () => {
    testDb = await startTestDatabase();
  });
  beforeEach(async () => {
    await testDb.truncateAll();
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

  it('confere por item, conclui e copia com os cadastros atuais comparando com a origem', async () => {
    const subject = await call('POST', 'subjects', { name: 'Disciplina fictícia' });
    expect(subject.statusCode, subject.body).toBe(201);
    const subjectId = (subject.json() as { id: string }).id;
    expect(
      (await call('POST', 'teachers', { name: 'Docente Um', subjectIds: [subjectId] })).statusCode,
    ).toBe(201);
    const created = await call('POST', 'plannings', { name: 'Plano fictício', year: 2027 });
    expect(created.statusCode, created.body).toBe(201);
    const planning = planningSchema.parse(created.json());
    const revisionId = (await detail(planning.id)).revisions[0]?.id ?? '';

    const initial = await checklist(planning.id, revisionId);
    expect(initial.reference).toBeNull();
    expect(initial.items.map((i) => i.item)).toEqual([...REVIEW_ITEMS]);
    expect(initial.items.find((i) => i.item === 'teachers')?.attention).toEqual([
      'Professor Docente Um não tem atribuições nesta revisão.',
    ]);

    const review = (version: number, reviewedItems: readonly string[], cookie = editorCookie) =>
      call(
        'PUT',
        'plannings/' + planning.id,
        { version, revisionId, operation: 'review', reviewedItems },
        cookie,
      );
    expect((await review(1, ['rules'], viewerCookie)).statusCode).toBe(403);
    expect((await review(1, ['availability', 'rules'])).statusCode).toBe(200);
    expect((await detail(planning.id)).revisions[0]?.reviewedItems).toEqual([
      'availability',
      'rules',
    ]);
    const blocked = await call('PUT', 'plannings/' + planning.id, {
      version: 2,
      revisionId,
      operation: 'seal',
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ error: { code: 'planning.review_required' } });

    // O banco recusa item desconhecido e conclusão sem todos os itens, mesmo sem a API.
    await expect(
      testDb.db.planningRevision.update({
        where: { id: revisionId },
        data: { reviewedItems: ['outro'] },
      }),
    ).rejects.toThrow(/planning_revision_valid/);
    await expect(
      testDb.db.planningRevision.update({
        where: { id: revisionId },
        data: { sealedAt: new Date() },
      }),
    ).rejects.toThrow(/planning_revision_valid/);

    expect((await review(2, [...REVIEW_ITEMS])).statusCode).toBe(200);
    const sealed = await call('PUT', 'plannings/' + planning.id, {
      version: 3,
      revisionId,
      operation: 'seal',
    });
    expect(sealed.statusCode, sealed.body).toBe(200);
    expect((await checklist(planning.id, revisionId)).complete).toBe(true);

    // Os cadastros mudam para o ano seguinte depois da conclusão.
    expect(
      (await call('POST', 'teachers', { name: 'Docente Dois', subjectIds: [subjectId] }))
        .statusCode,
    ).toBe(201);
    const copied = await call('POST', 'plannings', {
      name: 'Plano do ano seguinte',
      year: 2028,
      sourceId: planning.id,
      sourceVersion: 4,
      base: 'current',
    });
    expect(copied.statusCode, copied.body).toBe(201);
    const copy = await detail(planningSchema.parse(copied.json()).id);
    const copyRevision = copy.revisions[0];
    expect(copyRevision).toMatchObject({ sourceRevisionId: revisionId, reviewedItems: [] });
    expect(copyRevision?.snapshot.teachers).toHaveLength(2);
    const next = await checklist(copy.id, copyRevision?.id ?? '');
    expect(next.reference).toEqual({ id: revisionId, label: 'Plano fictício, revisão 1' });
    expect(next.items.find((i) => i.item === 'teachers')?.changes).toEqual([
      { kind: 'added', label: 'Professor Docente Dois', fields: [] },
    ]);
    expect(next.items.find((i) => i.item === 'availability')?.changes).toEqual([
      { kind: 'added', label: 'Professor Docente Dois', fields: [] },
    ]);
    expect(
      await testDb.db.auditEvent.count({ where: { action: 'planning.copy', entityId: copy.id } }),
    ).toBe(1);

    // A origem da cópia faz parte da identidade da revisão.
    await expect(
      testDb.db.planningRevision.update({
        where: { id: copyRevision?.id ?? '' },
        data: { sourceRevisionId: null },
      }),
    ).rejects.toThrow(/imutável/);
  });

  it('a cópia pela fotografia da origem pode deixar a grade para trás', async () => {
    const created = planningSchema.parse(
      (await call('POST', 'plannings', { name: 'Plano fictício', year: 2027 })).json(),
    );
    const invalid = await call('POST', 'plannings', {
      name: 'Plano inválido',
      year: 2028,
      base: 'current',
    });
    expect(invalid.statusCode).toBe(400);
    const copied = await call('POST', 'plannings', {
      name: 'Plano sem grade',
      year: 2028,
      sourceId: created.id,
      sourceVersion: 1,
      keepGrid: false,
    });
    expect(copied.statusCode, copied.body).toBe(201);
    const copy = await detail(planningSchema.parse(copied.json()).id);
    const source = (await detail(created.id)).revisions[0];
    expect(copy.revisions[0]?.snapshot).toEqual(source?.snapshot);
    expect(copy.revisions[0]?.sourceRevisionId).toBe(source?.id);
    const fromSource = await checklist(copy.id, copy.revisions[0]?.id ?? '');
    expect(fromSource.items.every((item) => item.changes.length === 0)).toBe(true);
  });
});
