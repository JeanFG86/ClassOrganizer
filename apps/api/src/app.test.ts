import {
  SubjectNameAlreadyInUseError,
  UnknownSubjectError,
  createSubject,
  createTeacher,
  type ListSubjects,
  type ListTeachers,
  type RegisterSubject,
  type RegisterTeacher,
} from '@classorganizer/core';
import {
  apiErrorSchema,
  subjectListSchema,
  subjectSchema,
  teacherListSchema,
  teacherSchema,
} from '@classorganizer/contracts';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp, type AppDeps } from './app.ts';

const createdAt = new Date('2026-02-01T12:00:00.000Z');
const math = createSubject({ id: 'id-1', name: 'Matemática', createdAt });
const ana = createTeacher({ id: 't-1', name: 'Ana Souza', subjectIds: ['id-1'], createdAt });

function makeApp(overrides: Partial<AppDeps> = {}): FastifyInstance {
  return buildApp(
    {
      registerSubject: vi.fn<RegisterSubject>(async () => math),
      listSubjects: vi.fn<ListSubjects>(async () => [math]),
      registerTeacher: vi.fn<RegisterTeacher>(async () => ana),
      listTeachers: vi.fn<ListTeachers>(async () => [ana]),
      checkReadiness: async () => {},
      ...overrides,
    },
    { logger: false },
  );
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
    it('lista no formato do contrato', async () => {
      app = makeApp();

      const response = await app.inject({ method: 'GET', url: '/api/v1/subjects' });

      expect(response.statusCode).toBe(200);
      expect(subjectListSchema.parse(response.json())).toEqual({
        items: [{ id: 'id-1', name: 'Matemática', createdAt: '2026-02-01T12:00:00.000Z' }],
      });
    });

    it('cadastra e responde 201', async () => {
      const registerSubject = vi.fn<RegisterSubject>(async () => math);
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
      const registerSubject = vi.fn<RegisterSubject>();
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
          throw new SubjectNameAlreadyInUseError('Matemática');
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
            id: 't-1',
            name: 'Ana Souza',
            subjectIds: ['id-1'],
            createdAt: '2026-02-01T12:00:00.000Z',
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
        payload: { name: 'Ana Souza', subjectIds: ['id-1'] },
      });

      expect(response.statusCode).toBe(201);
      expect(teacherSchema.parse(response.json()).subjectIds).toEqual(['id-1']);
      expect(registerTeacher).toHaveBeenCalledWith({ name: 'Ana Souza', subjectIds: ['id-1'] });
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

    it('disciplina inexistente responde 400 com mensagem legível', async () => {
      app = makeApp({
        registerTeacher: async () => {
          throw new UnknownSubjectError();
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/teachers',
        payload: { name: 'Ana', subjectIds: ['removida'] },
      });

      expect(response.statusCode).toBe(400);
      expect(apiErrorSchema.parse(response.json()).error.code).toBe('teacher.unknown_subject');
    });
  });

  it('rota inexistente responde 404 no formato de erro', async () => {
    app = makeApp();

    const response = await app.inject({ method: 'GET', url: '/api/v1/nada' });

    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('route.not_found');
  });
});
