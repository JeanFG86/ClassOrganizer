import {
  apiErrorSchema,
  classGroupSchema,
  shiftListSchema,
  shiftSchema,
} from '@classorganizer/contracts';
import {
  InvalidPeriodsError,
  PeriodInUseError,
  ShiftInUseError,
  ShiftNameAlreadyInUseError,
  ShiftNotFoundError,
  createClassGroup,
  createShift,
  scheduleClassGroup,
  type ArchiveShift,
  type ChangeClassGroupSchedule,
  type ListShifts,
  type RegisterShift,
  type UpdateShift,
} from '@classorganizer/core';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../testing/stub-deps.ts';

const createdAt = new Date('2026-02-01T12:00:00.000Z');
const MORNING = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
const C6A = '6a6a6a6a-6a6a-4a6a-8a6a-6a6a6a6a6a6a';
const P1 = '10000000-0000-4000-8000-000000000001';
const P2 = '10000000-0000-4000-8000-000000000002';
const queue = [P1, P2];
const manha = createShift(
  {
    id: MORNING,
    name: 'Manhã',
    periods: [
      { startMinute: 450, endMinute: 500 },
      { startMinute: 520, endMinute: 570 },
    ],
    createdAt,
  },
  { next: () => queue.shift() ?? '' },
);

describe('API HTTP — turnos e aulas', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('lista com os horários em HH:MM, no formato do contrato', async () => {
    app = buildTestApp({ listShifts: vi.fn<ListShifts['execute']>(async () => [manha]) });

    const response = await app.inject({ method: 'GET', url: '/api/v1/shifts' });

    expect(shiftListSchema.parse(response.json()).items).toEqual([
      {
        id: MORNING,
        name: 'Manhã',
        periods: [
          { id: P1, start: '07:30', end: '08:20' },
          { id: P2, start: '08:40', end: '09:30' },
        ],
        createdAt: '2026-02-01T12:00:00.000Z',
        archivedAt: null,
        version: 1,
      },
    ]);
  });

  it('cadastra convertendo HH:MM em minutos e responde 201', async () => {
    const registerShift = vi.fn<RegisterShift['execute']>(async () => manha);
    app = buildTestApp({ registerShift });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/shifts',
      payload: { name: 'Manhã', periods: [{ start: '07:30', end: '08:20' }] },
    });

    expect(response.statusCode).toBe(201);
    expect(shiftSchema.parse(response.json()).id).toBe(MORNING);
    expect(registerShift).toHaveBeenCalledWith({
      name: 'Manhã',
      periods: [{ id: undefined, startMinute: 450, endMinute: 500 }],
    });
  });

  it.each([
    ['horário fora do formato', { name: 'Manhã', periods: [{ start: '7:30', end: '08:20' }] }],
    ['hora inexistente', { name: 'Manhã', periods: [{ start: '24:00', end: '24:50' }] }],
    ['sem aulas no corpo', { name: 'Manhã' }],
  ])('recusa requisição fora do contrato: %s', async (_case, payload) => {
    const registerShift = vi.fn<RegisterShift['execute']>();
    app = buildTestApp({ registerShift });

    const response = await app.inject({ method: 'POST', url: '/api/v1/shifts', payload });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('request.invalid');
    expect(registerShift).not.toHaveBeenCalled();
  });

  it.each([
    [
      new InvalidPeriodsError('Informe pelo menos uma aula do turno.'),
      400,
      'shift.invalid_periods',
    ],
    [new ShiftNameAlreadyInUseError(manha), 409, 'shift.name_in_use'],
    [new PeriodInUseError(['6º A']), 409, 'shift.period_in_use'],
    [new ShiftNotFoundError(), 404, 'shift.not_found'],
  ])('traduz erro de alteração (%s)', async (error, status, code) => {
    const updateShift = vi.fn<UpdateShift['execute']>(async () => {
      throw error;
    });
    app = buildTestApp({ updateShift });

    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/shifts/${MORNING}`,
      payload: {
        name: 'Manhã',
        periods: [
          { id: P1, start: '07:30', end: '08:20' },
          { start: '10:00', end: '10:50' },
        ],
        version: 1,
      },
    });

    expect(response.statusCode).toBe(status);
    expect(apiErrorSchema.parse(response.json()).error).toEqual({ code, message: error.message });
    expect(updateShift).toHaveBeenCalledWith({
      id: MORNING,
      version: 1,
      name: 'Manhã',
      periods: [
        { id: P1, startMinute: 450, endMinute: 500 },
        { id: undefined, startMinute: 600, endMinute: 650 },
      ],
    });
  });

  it('arquivar turno com turmas responde 409 com o nome das turmas', async () => {
    app = buildTestApp({
      archiveShift: vi.fn<ArchiveShift['execute']>(async () => {
        throw new ShiftInUseError(['6º A']);
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/shifts/${MORNING}/archive`,
      payload: { version: 1 },
    });

    expect(response.statusCode).toBe(409);
    expect(apiErrorSchema.parse(response.json()).error.message).toContain('6º A');
  });

  it('define o turno e as aulas da turma', async () => {
    const turma = scheduleClassGroup(
      createClassGroup({ id: C6A, name: '6º A', createdAt }),
      manha,
      [P1],
    );
    const changeClassGroupSchedule = vi.fn<ChangeClassGroupSchedule['execute']>(async () => ({
      ...turma,
      version: 2,
    }));
    app = buildTestApp({ changeClassGroupSchedule });

    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/class-groups/${C6A}/schedule`,
      payload: { shiftId: MORNING, periodIds: [P1], version: 1 },
    });

    expect(response.statusCode).toBe(200);
    expect(classGroupSchema.parse(response.json())).toMatchObject({
      shiftId: MORNING,
      periodIds: [P1],
      version: 2,
    });
    expect(changeClassGroupSchedule).toHaveBeenCalledWith({
      id: C6A,
      shiftId: MORNING,
      periodIds: [P1],
      version: 1,
    });
  });
});
