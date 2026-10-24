import {
  InvalidClassScheduleError,
  PeriodInUseError,
  ShiftNameAlreadyInUseError,
  StaleVersionError,
  createClassGroup,
  createShift,
  scheduleClassGroup,
} from '@classorganizer/core';
import type { Shift } from '@classorganizer/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDatabase } from '../../testing/postgres-container.ts';
import type { TestDatabase } from '../../testing/postgres-container.ts';
import { PrismaClassGroupRepository } from './prisma-class-group-repository.ts';
import { PrismaShiftRepository } from './prisma-shift-repository.ts';

const createdAt = new Date('2026-02-01T12:00:00.000Z');
const MORNING = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
const AFTERNOON = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b';
const C6A = '6a6a6a6a-6a6a-4a6a-8a6a-6a6a6a6a6a6a';
const periodIds = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
];

function sequence(ids: readonly string[]) {
  const queue = [...ids];
  return { next: () => queue.shift() ?? '' };
}

function morning(): Shift {
  return createShift(
    {
      id: MORNING,
      name: 'Manhã',
      periods: [
        { startMinute: 450, endMinute: 500 },
        { startMinute: 500, endMinute: 550 },
        { startMinute: 570, endMinute: 620 },
      ],
      createdAt,
    },
    sequence(periodIds),
  );
}

describe('PrismaShiftRepository e turno da turma (PostgreSQL)', () => {
  let testDb: TestDatabase;
  let shifts: PrismaShiftRepository;
  let classGroups: PrismaClassGroupRepository;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    shifts = new PrismaShiftRepository(testDb.db);
    classGroups = new PrismaClassGroupRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.truncateAll();
  });

  it('grava, busca e lista o turno com as aulas ordenadas', async () => {
    const shift = morning();

    await shifts.add(shift);

    expect(await shifts.findById(MORNING)).toEqual(shift);
    expect(await shifts.findByNormalizedName('manha')).toEqual(shift);
    expect(await shifts.listAll()).toEqual([shift]);
    expect(await shifts.findById('não-é-uuid')).toBeNull();
  });

  it('nome duplicado vira erro de domínio', async () => {
    await shifts.add(morning());

    await expect(shifts.add({ ...morning(), id: AFTERNOON, periods: [] })).rejects.toThrow(
      ShiftNameAlreadyInUseError,
    );
  });

  it('atualiza as aulas por diferença e rejeita versão antiga', async () => {
    const shift = morning();
    await shifts.add(shift);
    const [first, , third] = shift.periods;
    if (!first || !third) throw new Error('fixture');

    const changed: Shift = {
      ...shift,
      name: 'Matutino',
      normalizedName: 'matutino',
      periods: [
        { ...first, endMinute: 495 },
        third,
        { id: periodIds[3] ?? '', startMinute: 620, endMinute: 670 },
      ],
    };
    expect(await shifts.update(changed)).toMatchObject({ version: 2 });

    expect(await shifts.findById(MORNING)).toEqual({ ...changed, version: 2 });
    await expect(shifts.update(changed)).rejects.toThrow(StaleVersionError);
  });

  it('liga a turma ao turno, troca as aulas e tira do turno', async () => {
    const shift = morning();
    await shifts.add(shift);
    const turma = createClassGroup({ id: C6A, name: '6º A', createdAt });
    await classGroups.add(turma);
    const [p1, p2, p3] = shift.periods.map((p) => p.id);

    const scheduled = scheduleClassGroup(turma, shift, [p3 ?? '', p1 ?? '']);
    await classGroups.update(scheduled);
    expect(await classGroups.findById(C6A)).toEqual({
      ...scheduled,
      periodIds: [p1, p3],
      version: 2,
    });
    expect((await classGroups.findByShift(MORNING)).map((c) => c.id)).toEqual([C6A]);

    const reloaded = (await classGroups.findById(C6A)) ?? turma;
    await classGroups.update(scheduleClassGroup(reloaded, shift, [p2 ?? '']));
    expect((await classGroups.findById(C6A))?.periodIds).toEqual([p2]);

    const again = (await classGroups.findById(C6A)) ?? turma;
    await classGroups.update(scheduleClassGroup(again, null, []));
    expect(await classGroups.findById(C6A)).toMatchObject({
      shiftId: null,
      periodIds: [],
      version: 4,
    });
    expect(await classGroups.findByShift(MORNING)).toEqual([]);
  });

  it('troca a turma de turno em uma única gravação', async () => {
    const shift = morning();
    await shifts.add(shift);
    const afternoon = createShift(
      { id: AFTERNOON, name: 'Tarde', periods: [{ startMinute: 780, endMinute: 830 }], createdAt },
      sequence([periodIds[4] ?? '']),
    );
    await shifts.add(afternoon);
    const turma = createClassGroup({ id: C6A, name: '6º A', createdAt });
    await classGroups.add(turma);
    await classGroups.update(
      scheduleClassGroup(
        turma,
        shift,
        shift.periods.map((p) => p.id),
      ),
    );

    const current = (await classGroups.findById(C6A)) ?? turma;
    await classGroups.update(scheduleClassGroup(current, afternoon, [periodIds[4] ?? '']));

    expect(await classGroups.findById(C6A)).toMatchObject({
      shiftId: AFTERNOON,
      periodIds: [periodIds[4]],
    });
  });

  it('o banco impede remover aula marcada numa turma, sem passar pelo caso de uso', async () => {
    const shift = morning();
    await shifts.add(shift);
    const turma = createClassGroup({ id: C6A, name: '6º A', createdAt });
    await classGroups.add(turma);
    await classGroups.update(
      scheduleClassGroup(
        turma,
        shift,
        shift.periods.map((p) => p.id),
      ),
    );

    await expect(shifts.update({ ...shift, periods: shift.periods.slice(0, 2) })).rejects.toThrow(
      PeriodInUseError,
    );
    expect((await shifts.findById(MORNING))?.periods).toHaveLength(3);
  });

  it('o banco impede marcar na turma uma aula de outro turno', async () => {
    const shift = morning();
    await shifts.add(shift);
    const afternoon = createShift(
      { id: AFTERNOON, name: 'Tarde', periods: [{ startMinute: 780, endMinute: 830 }], createdAt },
      sequence([periodIds[4] ?? '']),
    );
    await shifts.add(afternoon);
    const turma = createClassGroup({ id: C6A, name: '6º A', createdAt });
    await classGroups.add(turma);

    // Burla a validação do domínio: turno da manhã com uma aula da tarde.
    await expect(
      classGroups.update({ ...turma, shiftId: MORNING, periodIds: [periodIds[4] ?? ''] }),
    ).rejects.toThrow(InvalidClassScheduleError);
    expect(await classGroups.findById(C6A)).toEqual(turma);
  });

  it('o banco recusa aula que termina antes de começar', async () => {
    const shift = morning();

    await expect(
      shifts.add({
        ...shift,
        periods: [{ id: periodIds[0] ?? '', startMinute: 500, endMinute: 450 }],
      }),
    ).rejects.toThrow(/shift_period_ends_after_start/);
  });
});
