import {
  InvalidAvailabilityError,
  createShift,
  createTeacher,
  setUnavailability,
} from '@classorganizer/core';
import type { Shift } from '@classorganizer/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDatabase } from '../testing/postgres-container.ts';
import type { TestDatabase } from '../testing/postgres-container.ts';
import { PrismaShiftRepository } from './prisma-shift-repository.ts';
import { PrismaTeacherRepository } from './prisma-teacher-repository.ts';

const createdAt = new Date('2026-02-01T12:00:00.000Z');
const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MORNING = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
const P1 = '10000000-0000-4000-8000-000000000001';
const P2 = '10000000-0000-4000-8000-000000000002';
const MISSING = '10000000-0000-4000-8000-0000000000ff';

function morning(): Shift {
  const queue = [P1, P2];
  return createShift(
    {
      id: MORNING,
      name: 'Manhã',
      periods: [
        { startMinute: 450, endMinute: 500 },
        { startMinute: 500, endMinute: 550 },
      ],
      createdAt,
    },
    { next: () => queue.shift() ?? '' },
  );
}

describe('carga e disponibilidade do professor (PostgreSQL)', () => {
  let testDb: TestDatabase;
  let teachers: PrismaTeacherRepository;
  let shifts: PrismaShiftRepository;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    teachers = new PrismaTeacherRepository(testDb.db);
    shifts = new PrismaShiftRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.truncateAll();
    await shifts.add(morning());
  });

  it('grava carga máxima e hora-atividade', async () => {
    const ana = createTeacher({
      id: ANA,
      name: 'Ana',
      subjectIds: [],
      maxWeeklyLessons: 20,
      planningPeriods: 7,
      createdAt,
    });

    await teachers.add(ana);
    expect(await teachers.findById(ANA)).toEqual(ana);

    await teachers.update({ ...ana, maxWeeklyLessons: null, planningPeriods: 0 });
    expect(await teachers.findById(ANA)).toMatchObject({
      maxWeeklyLessons: null,
      planningPeriods: 0,
      version: 2,
    });
  });

  it('substitui os horários indisponíveis e os devolve ordenados', async () => {
    const ana = createTeacher({ id: ANA, name: 'Ana', subjectIds: [], createdAt });
    await teachers.add(ana);
    const known = await shifts.existingPeriodIds([P1, P2, MISSING, 'não-é-uuid']);
    expect(known).toEqual(new Set([P1, P2]));

    const blocked = setUnavailability(
      ana,
      [
        { weekday: 5, periodId: P1 },
        { weekday: 1, periodId: P2 },
        { weekday: 1, periodId: P1 },
      ],
      known,
    );
    await teachers.update(blocked);
    expect(await teachers.findById(ANA)).toEqual({ ...blocked, version: 2 });

    const fewer = setUnavailability(
      { ...blocked, version: 2 },
      [{ weekday: 3, periodId: P2 }],
      known,
    );
    await teachers.update(fewer);
    expect((await teachers.findById(ANA))?.unavailable).toEqual([{ weekday: 3, periodId: P2 }]);
  });

  it('o banco recusa aula inexistente, sem passar pelo caso de uso', async () => {
    const ana = createTeacher({ id: ANA, name: 'Ana', subjectIds: [], createdAt });
    await teachers.add(ana);

    await expect(
      teachers.update({ ...ana, unavailable: [{ weekday: 1, periodId: MISSING }] }),
    ).rejects.toThrow(InvalidAvailabilityError);
    expect(await teachers.findById(ANA)).toEqual(ana);
  });

  it('o banco recusa dia fora de segunda a sexta e hora-atividade acima do limite', async () => {
    const ana = createTeacher({ id: ANA, name: 'Ana', subjectIds: [], createdAt });
    await teachers.add(ana);

    await expect(
      teachers.update({ ...ana, unavailable: [{ weekday: 6 as 5, periodId: P1 }] }),
    ).rejects.toThrow(/teacher_unavailability_weekday_range/);
    await expect(teachers.update({ ...ana, planningPeriods: 41 })).rejects.toThrow(
      /teacher_planning_periods_range/,
    );
  });

  it('a aula removida do turno deixa de constar como indisponível', async () => {
    const ana = createTeacher({ id: ANA, name: 'Ana', subjectIds: [], createdAt });
    await teachers.add(ana);
    await teachers.update(
      setUnavailability(
        ana,
        [
          { weekday: 1, periodId: P1 },
          { weekday: 2, periodId: P2 },
        ],
        new Set([P1, P2]),
      ),
    );

    const shift = morning();
    await shifts.update({ ...shift, periods: shift.periods.slice(0, 1) });

    expect((await teachers.findById(ANA))?.unavailable).toEqual([{ weekday: 1, periodId: P1 }]);
  });
});
