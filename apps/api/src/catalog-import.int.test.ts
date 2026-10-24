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
  catalogImportPreviewSchema,
  classGroupListSchema,
  teacherListSchema,
} from '@classorganizer/contracts';

const client = { 'x-entreaulas-client': 'web' };

describe('importação CSV pela API no PostgreSQL', () => {
  let testDb: TestDatabase;
  let app: ReturnType<typeof createSecureApp>;
  let editorCookie: string;
  let viewerCookie: string;

  async function seed(role: Role) {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    await testDb.db.appUser.create({
      data: { id, username: role + '-importa', role, passwordHash: 'x', createdAt: new Date() },
    });
    await testDb.db.loginSession.create({
      data: { tokenHash: hashToken(token), userId: id, expiresAt: new Date(Date.now() + 60_000) },
    });
    return 'entreaulas_session=' + token;
  }
  function call(method: 'GET' | 'POST', url: string, payload?: object, cookie = editorCookie) {
    return app.inject({
      method,
      url: '/api/v1/' + url,
      headers: { ...client, cookie },
      ...(payload ? { payload } : {}),
    });
  }
  async function catalogVersion() {
    return (await testDb.db.appState.findUniqueOrThrow({ where: { id: 1 } })).catalogVersion;
  }
  async function previewAndImport(kind: string, content: string) {
    const preview = catalogImportPreviewSchema.parse(
      (await call('POST', 'catalog-imports/preview', { kind, content })).json(),
    );
    expect(preview.summary.invalid, JSON.stringify(preview.rows)).toBe(0);
    const response = await call('POST', 'catalog-imports', {
      kind,
      content,
      digest: preview.digest,
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json() as { created: number; existing: number };
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

  it('importa os quatro cadastros em sequência, com auditoria e versão do catálogo', async () => {
    const shift = await call('POST', 'shifts', {
      name: 'Turno fictício',
      periods: [
        { start: '07:00', end: '07:50' },
        { start: '07:50', end: '08:40' },
        { start: '08:40', end: '09:30' },
      ],
    });
    expect(shift.statusCode, shift.body).toBe(201);
    const before = await catalogVersion();

    expect(
      await previewAndImport('subjects', 'Disciplina\nGeografia fictícia\nArte fictícia'),
    ).toEqual({ kind: 'subjects', created: 2, existing: 0 });
    await previewAndImport(
      'classGroups',
      'Turma;Turno;Aulas do turno\nTurma fictícia;Turno fictício;2',
    );
    await previewAndImport(
      'teachers',
      'Professor;Disciplinas;Carga máxima;Hora-atividade\n' +
        'Docente fictício;Geografia fictícia|Arte fictícia;20;2\n' +
        'Docente parceiro;Arte fictícia;;0',
    );
    const assignments = [
      'Turma;Disciplina;Professor;Aulas por semana;Bloco',
      'Turma fictícia;Geografia fictícia;Docente fictício;3;',
      'Turma fictícia;Arte fictícia;Docente fictício;2;Dupla',
      'Turma fictícia;Arte fictícia;Docente parceiro;2;Dupla',
    ].join('\n');
    await previewAndImport('assignments', assignments);

    expect(await catalogVersion()).toBe(before + 4);
    const actions = await testDb.db.auditEvent.findMany({
      where: { action: { startsWith: 'catalog.import.' } },
      orderBy: { occurredAt: 'asc' },
    });
    expect(actions.map((event) => event.action)).toEqual([
      'catalog.import.subjects',
      'catalog.import.classGroups',
      'catalog.import.teachers',
      'catalog.import.assignments',
    ]);

    const [classGroup] = classGroupListSchema.parse(
      (await call('GET', 'class-groups')).json(),
    ).items;
    expect(classGroup).toMatchObject({ name: 'Turma fictícia', version: 2 });
    expect(classGroup?.periodIds).toHaveLength(2);
    const teachers = teacherListSchema.parse((await call('GET', 'teachers')).json()).items;
    expect(teachers.find((t) => t.name === 'Docente fictício')).toMatchObject({
      maxWeeklyLessons: 20,
      planningPeriods: 2,
    });
    const blocks = assignmentListSchema.parse((await call('GET', 'assignments')).json()).items;
    expect(blocks.map((block) => block.participants.length).toSorted()).toEqual([1, 2]);

    // Reimportar o mesmo arquivo não duplica as cargas.
    const again = catalogImportPreviewSchema.parse(
      (
        await call('POST', 'catalog-imports/preview', { kind: 'assignments', content: assignments })
      ).json(),
    );
    expect(again.summary).toMatchObject({ create: 0, existing: 3 });
    const nothing = await call('POST', 'catalog-imports', {
      kind: 'assignments',
      content: assignments,
      digest: again.digest,
    });
    expect(nothing.json()).toMatchObject({ error: { code: 'catalog_import.nothing_to_import' } });
  });

  it('com uma linha inválida não grava nada, nem versão nem auditoria', async () => {
    const before = await catalogVersion();
    const content = 'Professor;Disciplinas\nDocente válido;\nDocente inválido;Disciplina ausente';
    const preview = catalogImportPreviewSchema.parse(
      (await call('POST', 'catalog-imports/preview', { kind: 'teachers', content })).json(),
    );
    expect(preview.rows.map((row) => row.status)).toEqual(['create', 'invalid']);

    const response = await call('POST', 'catalog-imports', {
      kind: 'teachers',
      content,
      digest: preview.digest,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'catalog_import.invalid' } });
    expect(await testDb.db.teacher.count()).toBe(0);
    expect(await catalogVersion()).toBe(before);
    expect(await testDb.db.auditEvent.count()).toBe(0);
  });

  it('recusa a confirmação quando o resultado de uma linha mudou, mas não por outros cadastros', async () => {
    const content = 'Disciplina\nHistória fictícia';
    const preview = catalogImportPreviewSchema.parse(
      (await call('POST', 'catalog-imports/preview', { kind: 'subjects', content })).json(),
    );
    expect((await call('POST', 'subjects', { name: 'História fictícia' })).statusCode).toBe(201);

    const response = await call('POST', 'catalog-imports', {
      kind: 'subjects',
      content,
      digest: preview.digest,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'concurrency.stale' } });
    expect(await testDb.db.subject.count()).toBe(1);

    // Uma alteração alheia ao arquivo não invalida a prévia.
    const other = 'Disciplina\nFilosofia fictícia';
    const shown = catalogImportPreviewSchema.parse(
      (await call('POST', 'catalog-imports/preview', { kind: 'subjects', content: other })).json(),
    );
    expect((await call('POST', 'subjects', { name: 'Outra disciplina' })).statusCode).toBe(201);
    const accepted = await call('POST', 'catalog-imports', {
      kind: 'subjects',
      content: other,
      digest: shown.digest,
    });
    expect(accepted.statusCode, accepted.body).toBe(201);
  });

  it('o perfil de consulta baixa o modelo, mas não faz prévia nem importa', async () => {
    const template = await call(
      'GET',
      'catalog-imports/subjects/template',
      undefined,
      viewerCookie,
    );
    expect(template.statusCode).toBe(200);
    expect(template.body).toContain('Disciplina');

    const payload = { kind: 'subjects', content: 'Disciplina\nArte' };
    expect((await call('POST', 'catalog-imports/preview', payload, viewerCookie)).statusCode).toBe(
      403,
    );
    expect(
      (await call('POST', 'catalog-imports', { ...payload, digest: 'resumo' }, viewerCookie))
        .statusCode,
    ).toBe(403);
    expect(await testDb.db.subject.count()).toBe(0);
  });
});
