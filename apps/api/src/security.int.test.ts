import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapAdmin, hashToken, prepareAccount } from '@classorganizer/infrastructure';
import type { Role } from '@classorganizer/core';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../packages/infrastructure/src/testing/postgres-container.ts';
import { createSecureApp } from './secure-app.ts';
import {
  planningDetailSchema,
  planningSchema,
  userAccountSchema,
  usersSchema,
} from '@classorganizer/contracts';

const password = 'senha ficticia 2026!';
const unknownId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const client = { 'x-entreaulas-client': 'web' };
describe('E4: HTTP, autorização, transações e revisões no PostgreSQL', () => {
  let testDb: TestDatabase;
  let app: ReturnType<typeof createSecureApp>;
  let passwordHash: string;
  let adminId: string;
  let adminCookie: string;
  let editorCookie: string;
  let viewerCookie: string;
  let editorId: string;
  async function seed(role: Role) {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    await testDb.db.appUser.create({
      data: { id, username: role + '-test', role, passwordHash, createdAt: new Date() },
    });
    await testDb.db.loginSession.create({
      data: { tokenHash: hashToken(token), userId: id, expiresAt: new Date(Date.now() + 60_000) },
    });
    return { id, cookie: 'entreaulas_session=' + token };
  }
  beforeAll(async () => {
    testDb = await startTestDatabase();
    passwordHash = (await prepareAccount({ username: 'admin-test', password, role: 'admin' }))
      .passwordHash;
  });
  beforeEach(async () => {
    await testDb.truncateAll();
    const admin = await seed('admin');
    adminId = admin.id;
    adminCookie = admin.cookie;
    const editor = await seed('editor');
    editorId = editor.id;
    editorCookie = editor.cookie;
    viewerCookie = (await seed('viewer')).cookie;
    app = createSecureApp(testDb.db, { logger: false, origin: 'http://localhost:8080' });
  });
  afterEach(async () => {
    await app?.close();
  });
  afterAll(async () => {
    await testDb?.stop();
  });
  const headers = (cookie = adminCookie) => ({ ...client, cookie });
  async function createPlanning() {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/plannings',
      headers: headers(editorCookie),
      payload: { name: 'Plano fictício', year: 2027 },
    });
    expect(response.statusCode, response.body).toBe(201);
    const planning = planningSchema.parse(response.json());
    const detail = planningDetailSchema.parse(
      (await app.inject({ url: '/api/v1/plannings/' + planning.id, headers: headers() })).json(),
    );
    const revision = detail.revisions[0];
    if (!revision) throw new Error('Revisão ausente.');
    return { planning, revision };
  }
  it('exige sessão nos dados e preserva a prontidão pública', async () => {
    for (const path of [
      'subjects',
      'teachers',
      'class-groups',
      'shifts',
      'assignments',
      'plannings',
      'users',
      'audit',
      'auth/session',
    ]) {
      expect((await app.inject('/api/v1/' + path)).statusCode, path).toBe(401);
    }
    expect((await app.inject('/health/ready')).statusCode).toBe(200);
  });
  it('login usa cookie restrito e persiste somente seu hash; logout revoga a sessão', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: client,
      payload: { username: 'ADMIN-Test', password },
    });
    expect(response.statusCode, response.body).toBe(200);
    const cookie = response.headers['set-cookie'];
    expect(typeof cookie).toBe('string');
    const value = String(cookie);
    expect(value).toContain('HttpOnly');
    expect(value).toContain('SameSite=Strict');
    expect(value).toContain('Path=/api');
    expect(value).toContain('Max-Age=28800');
    const token = value.split(';')[0]?.split('=')[1];
    if (!token) throw new Error('Cookie ausente.');
    expect(
      await testDb.db.loginSession.findUnique({ where: { tokenHash: hashToken(token) } }),
    ).not.toBeNull();
    expect(response.body).not.toContain('passwordHash');
    expect(response.body).not.toContain(token);
    const sessionCookie = 'entreaulas_session=' + token;
    expect(
      (await app.inject({ url: '/api/v1/auth/session', headers: headers(sessionCookie) }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/logout',
          headers: headers(sessionCookie),
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ url: '/api/v1/subjects', headers: headers(sessionCookie) })).statusCode,
    ).toBe(401);
  });
  it('nega login e gravações de outra origem, formulário simples ou sem cabeçalho próprio', async () => {
    for (const extra of [
      { origin: 'https://outra-origem.invalid' },
      { 'sec-fetch-site': 'cross-site' },
    ]) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            headers: { ...client, ...extra },
            payload: { username: 'admin-test', password },
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/subjects',
          headers: { cookie: adminCookie },
          payload: { name: 'Teste' },
        })
      ).statusCode,
    ).toBe(403);
    expect(await testDb.db.subject.count()).toBe(0);
  });
  it('sessão expirada, token por URL ou cabeçalho e conta desativada não dão acesso', async () => {
    const tokenHash = hashToken(adminCookie.slice('entreaulas_session='.length));
    await testDb.db.loginSession.update({ where: { tokenHash }, data: { expiresAt: new Date(0) } });
    expect((await app.inject({ url: '/api/v1/subjects', headers: headers() })).statusCode).toBe(
      401,
    );
    expect(
      (
        await app.inject({
          url: '/api/v1/subjects?token=' + editorCookie,
          headers: { authorization: 'Bearer ' + editorCookie },
        })
      ).statusCode,
    ).toBe(401);
    await testDb.db.appUser.update({ where: { id: editorId }, data: { disabled: true } });
    expect(
      (await app.inject({ url: '/api/v1/subjects', headers: headers(editorCookie) })).statusCode,
    ).toBe(401);
  });
  it('consulta lê todos os cadastros e planejamentos, sem acessar usuários ou auditoria', async () => {
    for (const path of [
      'subjects',
      'teachers',
      'class-groups',
      'shifts',
      'assignments',
      'plannings',
    ])
      expect(
        (await app.inject({ url: '/api/v1/' + path, headers: headers(viewerCookie) })).statusCode,
        path,
      ).toBe(200);
    for (const path of ['users', 'audit'])
      expect(
        (await app.inject({ url: '/api/v1/' + path, headers: headers(viewerCookie) })).statusCode,
      ).toBe(403);
  });
  const mutations = [
    ['POST', 'subjects', { name: 'Disciplina fictícia' }],
    ['PUT', 'subjects/' + unknownId, { name: 'Teste', version: 1 }],
    ['POST', 'subjects/' + unknownId + '/archive', { version: 1 }],
    ['POST', 'subjects/' + unknownId + '/restore', { version: 1 }],
    ['POST', 'teachers', { name: 'Docente Alfa', subjectIds: [] }],
    ['PUT', 'teachers/' + unknownId, { name: 'Docente Alfa', subjectIds: [], version: 1 }],
    ['POST', 'teachers/' + unknownId + '/archive', { version: 1 }],
    ['POST', 'teachers/' + unknownId + '/restore', { version: 1 }],
    ['PUT', 'teachers/' + unknownId + '/availability', { version: 1, unavailable: [] }],
    ['POST', 'class-groups', { name: 'Turma fictícia' }],
    ['PUT', 'class-groups/' + unknownId, { name: 'Teste', version: 1 }],
    ['POST', 'class-groups/' + unknownId + '/archive', { version: 1 }],
    ['POST', 'class-groups/' + unknownId + '/restore', { version: 1 }],
    [
      'PUT',
      'class-groups/' + unknownId + '/schedule',
      { version: 1, shiftId: null, periodIds: [] },
    ],
    ['POST', 'shifts', { name: 'Turno fictício', periods: [] }],
    ['PUT', 'shifts/' + unknownId, { name: 'Teste', version: 1, periods: [] }],
    ['POST', 'shifts/' + unknownId + '/archive', { version: 1 }],
    ['POST', 'shifts/' + unknownId + '/restore', { version: 1 }],
    ['POST', 'assignments', { classGroupId: unknownId, participants: [], weeklyLessons: 1 }],
    ['PUT', 'assignments/' + unknownId, { version: 1, participants: [], weeklyLessons: 1 }],
    ['DELETE', 'assignments/' + unknownId + '?version=1', undefined],
    ['POST', 'plannings', { name: 'Teste', year: 2027 }],
    ['PUT', 'plannings/' + unknownId, { version: 1, operation: 'review' }],
    ['POST', 'users', { username: 'new-user', password, role: 'admin' }],
    ['PUT', 'users/' + unknownId, { version: 1, role: 'admin', disabled: false }],
  ] as const;
  it.each(mutations)('consulta não pode executar %s /%s', async (method, path, payload) => {
    const response = await app.inject({
      method,
      url: '/api/v1/' + path,
      headers: headers(viewerCookie),
      ...(payload ? { payload } : {}),
    });
    expect(response.statusCode, response.body).toBe(403);
    expect(await testDb.db.auditEvent.count()).toBe(0);
  });
  it('mudança de papel vale na próxima operação e a auditoria atribui a alteração ao autor', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/subjects',
      headers: headers(editorCookie),
      payload: { name: 'Disciplina fictícia' },
    });
    expect(response.statusCode, response.body).toBe(201);
    const event = await testDb.db.auditEvent.findFirstOrThrow();
    expect(event).toMatchObject({ actorId: editorId, action: 'catalog.registerSubject' });
    expect(event.entityId).not.toBeNull();
    await testDb.db.appUser.update({ where: { id: editorId }, data: { role: 'viewer' } });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/subjects',
          headers: headers(editorCookie),
          payload: { name: 'Outro teste' },
        })
      ).statusCode,
    ).toBe(403);
    expect((await testDb.db.appState.findUniqueOrThrow({ where: { id: 1 } })).catalogVersion).toBe(
      2,
    );
  });
  it('falha da auditoria desfaz os dados e a versão do catálogo', async () => {
    await testDb.db.$executeRawUnsafe(
      "CREATE FUNCTION fail_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha simulada'; END; $$",
    );
    await testDb.db.$executeRawUnsafe(
      'CREATE TRIGGER fail_test_audit BEFORE INSERT ON audit_event FOR EACH ROW EXECUTE FUNCTION fail_test_audit()',
    );
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/subjects',
        headers: headers(editorCookie),
        payload: { name: 'Disciplina fictícia' },
      });
      expect(response.statusCode).toBe(500);
      expect(await testDb.db.subject.count()).toBe(0);
      expect(
        (await testDb.db.appState.findUniqueOrThrow({ where: { id: 1 } })).catalogVersion,
      ).toBe(1);
    } finally {
      await testDb.db.$executeRawUnsafe('DROP TRIGGER fail_test_audit ON audit_event');
      await testDb.db.$executeRawUnsafe('DROP FUNCTION fail_test_audit()');
    }
  });
  it('duas sessões não sobrescrevem a mesma revisão e IDs de revisão não podem ser trocados', async () => {
    const { planning, revision } = await createPlanning();
    const body = {
      version: 1,
      operation: 'review',
      revisionId: revision.id,
      reviewedItems: ['structure', 'teachers', 'assignments', 'availability', 'rules'],
    };
    const responses = await Promise.all(
      [editorCookie, adminCookie].map((cookie) =>
        app.inject({
          method: 'PUT',
          url: '/api/v1/plannings/' + planning.id,
          headers: headers(cookie),
          payload: body,
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/plannings/' + planning.id,
          headers: headers(),
          payload: { ...body, version: 2, revisionId: unknownId },
        })
      ).statusCode,
    ).toBe(409);
    expect(await testDb.db.auditEvent.count({ where: { action: 'planning.review' } })).toBe(1);
  });
  it('snapshot e auditoria são protegidos no banco; cópia e nova revisão exigem conferência', async () => {
    const { planning, revision } = await createPlanning();
    await expect(
      testDb.db.planningRevision.update({
        where: { id: revision.id },
        data: { snapshot: { formatVersion: 1 } },
      }),
    ).rejects.toThrow();
    await expect(
      testDb.db.planningRevision.delete({ where: { id: revision.id } }),
    ).rejects.toThrow();
    await expect(
      testDb.db.auditEvent.updateMany({ data: { action: 'changed' } }),
    ).rejects.toThrow();
    for (const [version, operation] of [
      [1, 'review'],
      [2, 'seal'],
    ] as const)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/api/v1/plannings/' + planning.id,
            headers: headers(editorCookie),
            payload: {
              version,
              operation,
              revisionId: revision.id,
              reviewedItems: ['structure', 'teachers', 'assignments', 'availability', 'rules'],
            },
          })
        ).statusCode,
      ).toBe(200);
    await expect(
      testDb.db.planningRevision.update({
        where: { id: revision.id },
        data: { reviewedItems: [] },
      }),
    ).rejects.toThrow();
    const copied = await app.inject({
      method: 'POST',
      url: '/api/v1/plannings',
      headers: headers(editorCookie),
      payload: { name: 'Cópia fictícia', year: 2028, sourceId: planning.id, sourceVersion: 3 },
    });
    expect(copied.statusCode, copied.body).toBe(201);
    const copy = planningDetailSchema.parse(
      (
        await app.inject({
          url: '/api/v1/plannings/' + planningSchema.parse(copied.json()).id,
          headers: headers(viewerCookie),
        })
      ).json(),
    );
    expect(copy.revisions[0]).toMatchObject({
      snapshot: revision.snapshot,
      reviewedItems: [],
    });
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/plannings/' + planning.id,
          headers: headers(editorCookie),
          payload: { version: 3, operation: 'draft', revisionId: revision.id },
        })
      ).statusCode,
    ).toBe(200);
    expect(await testDb.db.planningRevision.count({ where: { planningId: planning.id } })).toBe(2);
  });
  it('preserva fotografia dos cadastros e permite arquivo somente para administrador', async () => {
    const subject = await app.inject({
      method: 'POST',
      url: '/api/v1/subjects',
      headers: headers(),
      payload: { name: 'Disciplina antes' },
    });
    expect(subject.statusCode).toBe(201);
    const { planning, revision } = await createPlanning();
    await testDb.db.subject.updateMany({ data: { name: 'Disciplina depois' } });
    const detail = planningDetailSchema.parse(
      (
        await app.inject({
          url: '/api/v1/plannings/' + planning.id,
          headers: headers(viewerCookie),
        })
      ).json(),
    );
    expect(JSON.stringify(detail.revisions)).toContain('Disciplina antes');
    expect(JSON.stringify(detail.revisions)).not.toContain('Disciplina depois');
    const mutation = { version: 1, operation: 'archive' };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/plannings/' + planning.id,
          headers: headers(editorCookie),
          payload: mutation,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/plannings/' + planning.id,
          headers: headers(),
          payload: mutation,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      await testDb.db.planningRevision.findUnique({ where: { id: revision.id } }),
    ).not.toBeNull();
  });
  it('gerencia contas com versão, sem expor hash, revoga sessões e impede autodesativação', async () => {
    const listed = usersSchema.parse(
      (await app.inject({ url: '/api/v1/users', headers: headers() })).json(),
    );
    expect(listed).toHaveLength(3);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: headers(),
      payload: { username: 'new-user', password, role: 'viewer' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.body).not.toContain(passwordHash);
    userAccountSchema.parse(response.json());
    const edit = { role: 'viewer', disabled: true, version: 1 };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/users/' + editorId,
          headers: headers(),
          payload: edit,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/users/' + editorId,
          headers: headers(),
          payload: edit,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await app.inject({ url: '/api/v1/subjects', headers: headers(editorCookie) })).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/users/' + adminId,
          headers: headers(),
          payload: { ...edit, role: 'admin' },
        })
      ).statusCode,
    ).toBe(403);
  });
  it('troca de senha exige a atual e revoga todas as sessões', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password',
      headers: headers(),
      payload: { currentPassword: 'senha incorreta', password: 'outra senha ficticia' },
    });
    expect(response.statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/password',
          headers: headers(),
          payload: { currentPassword: password, password: 'outra senha ficticia' },
        })
      ).statusCode,
    ).toBe(204);
    expect(await testDb.db.loginSession.count({ where: { userId: adminId } })).toBe(0);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: client,
          payload: { username: 'admin-test', password },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('limita tentativas de login sem revelar se o usuário existe', async () => {
    for (let index = 0; index < 10; index++)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            headers: client,
            payload: { username: 'missing-user', password },
          })
        ).statusCode,
      ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: client,
          payload: { username: 'missing-user', password },
        })
      ).statusCode,
    ).toBe(429);
  });
  it('bootstrap é exclusivo e só funciona antes do primeiro usuário', async () => {
    await expect(bootstrapAdmin(testDb.db, 'first-admin', password)).rejects.toMatchObject({
      code: 'access.bootstrap_closed',
    });
    await testDb.truncateAll();
    const results = await Promise.allSettled([
      bootstrapAdmin(testDb.db, 'first-admin', password),
      bootstrapAdmin(testDb.db, 'other-admin', password),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await testDb.db.appUser.count()).toBe(1);
    expect(await testDb.db.auditEvent.count()).toBe(1);
  });
  it('pagina auditoria sem perder eventos com a mesma data e protege cookie HTTPS', async () => {
    const occurredAt = new Date('2026-01-01T00:00:00.000Z');
    await testDb.db.auditEvent.createMany({
      data: Array.from({ length: 105 }, () => ({
        id: randomUUID(),
        actorId: adminId,
        action: 'planning.create',
        occurredAt,
      })),
    });
    const first = (await app.inject({ url: '/api/v1/audit', headers: headers() })).json<
      { id: string; occurredAt: string }[]
    >();
    const cursor = first.at(-1);
    if (!cursor) throw new Error('Cursor ausente.');
    const second = (
      await app.inject({
        url:
          '/api/v1/audit?before=' +
          encodeURIComponent(cursor.occurredAt) +
          '&beforeId=' +
          cursor.id,
        headers: headers(),
      })
    ).json<{ id: string }[]>();
    expect(first).toHaveLength(100);
    expect(second).toHaveLength(5);
    expect(new Set([...first, ...second].map((event) => event.id)).size).toBe(105);
    expect(
      (
        await app.inject({
          url: '/api/v1/audit?before=' + encodeURIComponent(cursor.occurredAt),
          headers: headers(),
        })
      ).statusCode,
    ).toBe(400);
    const secure = createSecureApp(testDb.db, {
      logger: false,
      origin: 'https://entreaulas.invalid',
    });
    try {
      const login = await secure.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { ...client, origin: 'https://entreaulas.invalid' },
        payload: { username: 'admin-test', password },
      });
      expect(login.statusCode).toBe(200);
      expect(login.headers['set-cookie']).toContain('; Secure');
    } finally {
      await secure.close();
    }
  });
});
