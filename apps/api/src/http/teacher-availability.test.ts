import { apiErrorSchema, teacherSchema } from '@classorganizer/contracts';
import {
  InvalidAvailabilityError,
  InvalidWorkloadError,
  createTeacher,
  setUnavailability,
  type ChangeTeacherAvailability,
  type RegisterTeacher,
  type UpdateTeacher,
} from '@classorganizer/core';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../testing/stub-deps.ts';

const createdAt = new Date('2026-02-01T12:00:00.000Z');
const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const P1 = '10000000-0000-4000-8000-000000000001';
const ana = createTeacher({
  id: ANA,
  name: 'Ana',
  subjectIds: [],
  maxWeeklyLessons: 20,
  planningPeriods: 7,
  createdAt,
});

describe('API HTTP — carga e disponibilidade do professor', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('cadastra com carga máxima e hora-atividade, que voltam na resposta', async () => {
    const registerTeacher = vi.fn<RegisterTeacher['execute']>(async () => ana);
    app = buildTestApp({ registerTeacher });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/teachers',
      payload: { name: 'Ana', subjectIds: [], maxWeeklyLessons: 20, planningPeriods: 7 },
    });

    expect(response.statusCode).toBe(201);
    expect(teacherSchema.parse(response.json())).toMatchObject({
      maxWeeklyLessons: 20,
      planningPeriods: 7,
      unavailable: [],
    });
    expect(registerTeacher).toHaveBeenCalledWith({
      name: 'Ana',
      subjectIds: [],
      maxWeeklyLessons: 20,
      planningPeriods: 7,
    });
  });

  it('carga inválida responde 400 com a mensagem do domínio', async () => {
    const error = new InvalidWorkloadError(
      'A carga máxima deve ser um número inteiro de 1 a 60 aulas por semana.',
    );
    app = buildTestApp({
      updateTeacher: vi.fn<UpdateTeacher['execute']>(async () => {
        throw error;
      }),
    });

    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/teachers/${ANA}`,
      payload: { name: 'Ana', subjectIds: [], maxWeeklyLessons: 0, version: 1 },
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error).toEqual({
      code: 'teacher.invalid_workload',
      message: error.message,
    });
  });

  it('substitui os horários indisponíveis', async () => {
    const changed = setUnavailability(ana, [{ weekday: 2, periodId: P1 }], new Set([P1]));
    const changeTeacherAvailability = vi.fn<ChangeTeacherAvailability['execute']>(async () => ({
      ...changed,
      version: 2,
    }));
    app = buildTestApp({ changeTeacherAvailability });

    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/teachers/${ANA}/availability`,
      payload: { unavailable: [{ weekday: 2, periodId: P1 }], version: 1 },
    });

    expect(response.statusCode).toBe(200);
    expect(teacherSchema.parse(response.json()).unavailable).toEqual([
      { weekday: 2, periodId: P1 },
    ]);
    expect(changeTeacherAvailability).toHaveBeenCalledWith({
      id: ANA,
      unavailable: [{ weekday: 2, periodId: P1 }],
      version: 1,
    });
  });

  it.each([
    ['sábado', [{ weekday: 6, periodId: P1 }]],
    ['aula que não é uuid', [{ weekday: 1, periodId: 'p1' }]],
  ])('recusa requisição fora do contrato: %s', async (_case, unavailable) => {
    const changeTeacherAvailability = vi.fn<ChangeTeacherAvailability['execute']>();
    app = buildTestApp({ changeTeacherAvailability });

    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/teachers/${ANA}/availability`,
      payload: { unavailable, version: 1 },
    });

    expect(response.statusCode).toBe(400);
    expect(changeTeacherAvailability).not.toHaveBeenCalled();
  });

  it('aula que deixou de existir responde 400', async () => {
    app = buildTestApp({
      changeTeacherAvailability: vi.fn<ChangeTeacherAvailability['execute']>(async () => {
        throw new InvalidAvailabilityError();
      }),
    });

    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/teachers/${ANA}/availability`,
      payload: { unavailable: [{ weekday: 1, periodId: P1 }], version: 1 },
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('teacher.invalid_availability');
  });
});
