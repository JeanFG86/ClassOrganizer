import {
  apiErrorSchema,
  subjectListSchema,
  subjectSchema,
  teacherListSchema,
  teacherSchema,
} from '@classorganizer/contracts';
import {
  ArchivedSubjectError,
  StaleVersionError,
  SubjectNameAlreadyInUseError,
  SubjectNotFoundError,
  UnknownSubjectError,
  createSubject,
  createTeacher,
  type ArchiveSubject,
  type ArchiveTeacher,
  type ListSubjects,
  type ListTeachers,
  type RegisterSubject,
  type RegisterTeacher,
  type RestoreSubject,
  type RestoreTeacher,
  type UpdateSubject,
  type UpdateTeacher,
} from '@classorganizer/core';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppDeps } from './app.ts';
import { buildTestApp } from './testing/stub-deps.ts';

const createdAt = new Date('2026-02-01T12:00:00.000Z');
const archivedAt = new Date('2026-03-01T12:00:00.000Z');
const MATH_ID = '11111111-1111-4111-8111-111111111111';
const ANA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const math = createSubject({ id: MATH_ID, name: 'Matemática', createdAt });
const ana = createTeacher({ id: ANA_ID, name: 'Ana Souza', subjectIds: [MATH_ID], createdAt });

function makeApp(overrides: Partial<AppDeps> = {}): FastifyInstance {
  return buildTestApp({
    registerSubject: vi.fn<RegisterSubject['execute']>(async () => math),
    listSubjects: vi.fn<ListSubjects['execute']>(async () => [math]),
    updateSubject: vi.fn<UpdateSubject['execute']>(async () => ({ ...math, version: 2 })),
    archiveSubject: vi.fn<ArchiveSubject['execute']>(async () => ({
      ...math,
      archivedAt,
      version: 2,
    })),
    restoreSubject: vi.fn<RestoreSubject['execute']>(async () => ({ ...math, version: 3 })),
    registerTeacher: vi.fn<RegisterTeacher>(async () => ana),
    listTeachers: vi.fn<ListTeachers>(async () => [ana]),
    updateTeacher: vi.fn<UpdateTeacher>(async () => ({ ...ana, version: 2 })),
    archiveTeacher: vi.fn<ArchiveTeacher>(async () => ({ ...ana, archivedAt, version: 2 })),
    restoreTeacher: vi.fn<RestoreTeacher>(async () => ({ ...ana, version: 3 })),
    ...overrides,
  });
}

describe('API HTTP', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  describe('health', () => {
    it('GET /health responde sem depender do banco', async () => {
      app = makeApp({ checkReadiness: () => Promise.reject(new Error('down')) });

      const response = await app.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    });

    it('GET /health/ready responde 503 quando o banco está indisponível', async () => {
      app = makeApp({ checkReadiness: () => Promise.reject(new Error('down')) });

      const response = await app.inject({ method: 'GET', url: '/health/ready' });

      expect(response.statusCode).toBe(503);
    });

    it('GET /health/ready responde 200 quando pronto', async () => {
      app = makeApp();

      const response = await app.inject({ method: 'GET', url: '/health/ready' });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('disciplinas', () => {
    it('lista no formato do contrato, com versão e arquivamento', async () => {
      app = makeApp();

      const response = await app.inject({ method: 'GET', url: '/api/v1/subjects' });

      expect(response.statusCode).toBe(200);
      expect(subjectListSchema.parse(response.json())).toEqual({
        items: [
          {
            id: MATH_ID,
            name: 'Matemática',
            createdAt: '2026-02-01T12:00:00.000Z',
            archivedAt: null,
            version: 1,
          },
        ],
      });
    });

    it('cadastra e responde 201', async () => {
      const registerSubject = vi.fn<RegisterSubject['execute']>(async () => math);
      app = makeApp({ registerSubject });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/subjects',
        payload: { name: 'Matemática' },
      });

      expect(response.statusCode).toBe(201);
      expect(subjectSchema.parse(response.json()).name).toBe('Matemática');
      expect(registerSubject).toHaveBeenCalledWith({ name: 'Matemática' });
    });

    it('rejeita corpo fora do contrato sem chamar o caso de uso', async () => {
      const registerSubject = vi.fn<RegisterSubject['execute']>();
      app = makeApp({ registerSubject });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/subjects',
        payload: { name: 42 },
      });

      expect(response.statusCode).toBe(400);
      expect(apiErrorSchema.parse(response.json()).error.code).toBe('request.invalid');
      expect(registerSubject).not.toHaveBeenCalled();
    });

    it('traduz conflito de domínio em 409 com mensagem legível', async () => {
      app = makeApp({
        registerSubject: async () => {
          throw new SubjectNameAlreadyInUseError(math);
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/subjects',
        payload: { name: 'matematica' },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: {
          code: 'subject.name_in_use',
          message: 'Já existe uma disciplina chamada "Matemática".',
        },
      });
    });

    it('PUT renomeia repassando id, nome e versão', async () => {
      const updateSubject = vi.fn<UpdateSubject['execute']>(async () => ({ ...math, version: 2 }));
      app = makeApp({ updateSubject });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/subjects/${MATH_ID}`,
        payload: { name: 'Matemática', version: 1 },
      });

      expect(response.statusCode).toBe(200);
      expect(subjectSchema.parse(response.json()).version).toBe(2);
      expect(updateSubject).toHaveBeenCalledWith({ id: MATH_ID, name: 'Matemática', version: 1 });
    });

    it('PUT exige a versão no corpo', async () => {
      const updateSubject = vi.fn<UpdateSubject['execute']>();
      app = makeApp({ updateSubject });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/subjects/${MATH_ID}`,
        payload: { name: 'Matemática' },
      });

      expect(response.statusCode).toBe(400);
      expect(updateSubject).not.toHaveBeenCalled();
    });

    it('rejeita id que não é UUID', async () => {
      const archiveSubject = vi.fn<ArchiveSubject['execute']>();
      app = makeApp({ archiveSubject });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/subjects/abc/archive',
        payload: { version: 1 },
      });

      expect(response.statusCode).toBe(400);
      expect(archiveSubject).not.toHaveBeenCalled();
    });

    it('arquiva e restaura com a versão informada', async () => {
      const archiveSubject = vi.fn<ArchiveSubject['execute']>(async () => ({
        ...math,
        archivedAt,
        version: 2,
      }));
      const restoreSubject = vi.fn<RestoreSubject['execute']>(async () => ({
        ...math,
        version: 3,
      }));
      app = makeApp({ archiveSubject, restoreSubject });

      const archived = await app.inject({
        method: 'POST',
        url: `/api/v1/subjects/${MATH_ID}/archive`,
        payload: { version: 1 },
      });
      const restored = await app.inject({
        method: 'POST',
        url: `/api/v1/subjects/${MATH_ID}/restore`,
        payload: { version: 2 },
      });

      expect(subjectSchema.parse(archived.json()).archivedAt).toBe('2026-03-01T12:00:00.000Z');
      expect(subjectSchema.parse(restored.json()).archivedAt).toBeNull();
      expect(archiveSubject).toHaveBeenCalledWith({ id: MATH_ID, version: 1 });
      expect(restoreSubject).toHaveBeenCalledWith({ id: MATH_ID, version: 2 });
    });

    it('versão desatualizada responde 409 concurrency.stale', async () => {
      app = makeApp({
        updateSubject: async () => {
          throw new StaleVersionError();
        },
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/subjects/${MATH_ID}`,
        payload: { name: 'X', version: 1 },
      });

      expect(response.statusCode).toBe(409);
      expect(apiErrorSchema.parse(response.json()).error.code).toBe('concurrency.stale');
    });

    it('disciplina inexistente responde 404', async () => {
      app = makeApp({
        archiveSubject: async () => {
          throw new SubjectNotFoundError();
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/subjects/${MATH_ID}/archive`,
        payload: { version: 1 },
      });

      expect(response.statusCode).toBe(404);
      expect(apiErrorSchema.parse(response.json()).error.code).toBe('subject.not_found');
    });

    it('não expõe detalhes de erros inesperados', async () => {
      app = makeApp({
        listSubjects: async () => {
          throw new Error('connection string secreta');
        },
      });

      const response = await app.inject({ method: 'GET', url: '/api/v1/subjects' });

      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain('secreta');
    });
  });

  describe('professores', () => {
    it('lista no formato do contrato', async () => {
      app = makeApp();

      const response = await app.inject({ method: 'GET', url: '/api/v1/teachers' });

      expect(response.statusCode).toBe(200);
      expect(teacherListSchema.parse(response.json())).toEqual({
        items: [
          {
            id: ANA_ID,
            name: 'Ana Souza',
            subjectIds: [MATH_ID],
            maxWeeklyLessons: null,
            planningPeriods: 0,
            unavailable: [],
            createdAt: '2026-02-01T12:00:00.000Z',
            archivedAt: null,
            version: 1,
          },
        ],
      });
    });

    it('cadastra com habilitações e responde 201', async () => {
      const registerTeacher = vi.fn<RegisterTeacher>(async () => ana);
      app = makeApp({ registerTeacher });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/teachers',
        payload: { name: 'Ana Souza', subjectIds: [MATH_ID] },
      });

      expect(response.statusCode).toBe(201);
      expect(teacherSchema.parse(response.json()).subjectIds).toEqual([MATH_ID]);
      expect(registerTeacher).toHaveBeenCalledWith({ name: 'Ana Souza', subjectIds: [MATH_ID] });
    });

    it('exige a lista de habilitações no corpo', async () => {
      const registerTeacher = vi.fn<RegisterTeacher>();
      app = makeApp({ registerTeacher });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/teachers',
        payload: { name: 'Ana' },
      });

      expect(response.statusCode).toBe(400);
      expect(registerTeacher).not.toHaveBeenCalled();
    });

    it.each([
      ['inexistente', new UnknownSubjectError(), 'teacher.unknown_subject'],
      ['arquivada', new ArchivedSubjectError(), 'teacher.archived_subject'],
    ])('disciplina %s responde 400 com código próprio', async (_label, error, code) => {
      app = makeApp({
        registerTeacher: async () => {
          throw error;
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/teachers',
        payload: { name: 'Ana', subjectIds: [MATH_ID] },
      });

      expect(response.statusCode).toBe(400);
      expect(apiErrorSchema.parse(response.json()).error.code).toBe(code);
    });

    it('PUT substitui nome e habilitações com a versão', async () => {
      const updateTeacher = vi.fn<UpdateTeacher>(async () => ({ ...ana, version: 2 }));
      app = makeApp({ updateTeacher });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/teachers/${ANA_ID}`,
        payload: { name: 'Ana', subjectIds: [], version: 1 },
      });

      expect(response.statusCode).toBe(200);
      expect(updateTeacher).toHaveBeenCalledWith({
        id: ANA_ID,
        name: 'Ana',
        subjectIds: [],
        version: 1,
      });
    });

    it('arquiva e restaura com a versão informada', async () => {
      const archiveTeacher = vi.fn<ArchiveTeacher>(async () => ({
        ...ana,
        archivedAt,
        version: 2,
      }));
      const restoreTeacher = vi.fn<RestoreTeacher>(async () => ({ ...ana, version: 3 }));
      app = makeApp({ archiveTeacher, restoreTeacher });

      await app.inject({
        method: 'POST',
        url: `/api/v1/teachers/${ANA_ID}/archive`,
        payload: { version: 1 },
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/teachers/${ANA_ID}/restore`,
        payload: { version: 2 },
      });

      expect(archiveTeacher).toHaveBeenCalledWith({ id: ANA_ID, version: 1 });
      expect(restoreTeacher).toHaveBeenCalledWith({ id: ANA_ID, version: 2 });
    });
  });

  it('rota inexistente responde 404 no formato de erro', async () => {
    app = makeApp();

    const response = await app.inject({ method: 'GET', url: '/api/v1/nada' });

    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('route.not_found');
  });
});
