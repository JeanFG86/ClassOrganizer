import { bindUseCase } from '../../../shared/use-case.ts';
import { beforeEach, describe, expect, it } from 'vitest';
import { StaleVersionError } from '../../../shared/versioning.ts';
import { InMemoryAssignmentRepository } from '../../../testing/in-memory-repositories.ts';
import {
  InvalidAvailabilityError,
  InvalidWorkloadError,
  TeacherNotFoundError,
  type SubjectStatus,
  type Teacher,
} from '../domain/teacher.ts';
import { ChangeTeacherAvailability, RegisterTeacher, UpdateTeacher } from './usecases/teachers.ts';
import type { PeriodLookup, TeacherRepository } from './ports/index.ts';

class InMemoryTeacherRepository implements TeacherRepository {
  readonly items = new Map<string, Teacher>();

  async findById(id: string) {
    return this.items.get(id) ?? null;
  }

  async add(teacher: Teacher) {
    this.items.set(teacher.id, teacher);
  }

  async update(teacher: Teacher) {
    if (this.items.get(teacher.id)?.version !== teacher.version) {
      throw new StaleVersionError();
    }
    const saved = { ...teacher, version: teacher.version + 1 };
    this.items.set(teacher.id, saved);
    return saved;
  }

  async listAll() {
    return [...this.items.values()];
  }
}

const now = new Date('2026-02-01T12:00:00Z');
const periodIds = new Set(['p1', 'p2', 'p3']);

describe('carga, hora-atividade e disponibilidade do professor', () => {
  let teachers: InMemoryTeacherRepository;
  let register: RegisterTeacher['execute'];
  let update: UpdateTeacher['execute'];
  let changeAvailability: ChangeTeacherAvailability['execute'];

  beforeEach(() => {
    teachers = new InMemoryTeacherRepository();
    const subjects = {
      subjectStatuses: async (ids: readonly string[]) =>
        new Map(ids.map((id): [string, SubjectStatus] => [id, 'active'])),
    };
    const periods: PeriodLookup = {
      existingPeriodIds: async (ids) => new Set(ids.filter((id) => periodIds.has(id))),
    };
    register = bindUseCase(
      new RegisterTeacher({
        teachers,
        subjects,
        clock: { now: () => now },
        ids: { next: () => 't-1' },
      }),
    );
    update = bindUseCase(
      new UpdateTeacher({
        teachers,
        subjects,
        assignments: new InMemoryAssignmentRepository(),
      }),
    );
    changeAvailability = bindUseCase(new ChangeTeacherAvailability({ teachers, periods }));
  });

  describe('carga máxima e hora-atividade', () => {
    it('cadastra sem limite e sem hora-atividade quando não informados', async () => {
      const teacher = await register({ name: 'Ana', subjectIds: [] });

      expect(teacher).toMatchObject({ maxWeeklyLessons: null, planningPeriods: 0 });
    });

    it('cadastra e altera os valores informados; omitidos ficam como estão', async () => {
      await register({ name: 'Ana', subjectIds: [], maxWeeklyLessons: 20, planningPeriods: 7 });

      const renamed = await update({ id: 't-1', version: 1, name: 'Ana S.', subjectIds: [] });
      expect(renamed).toMatchObject({ maxWeeklyLessons: 20, planningPeriods: 7 });

      const changed = await update({
        id: 't-1',
        version: 2,
        name: 'Ana S.',
        subjectIds: [],
        maxWeeklyLessons: null,
        planningPeriods: 0,
      });
      expect(changed).toMatchObject({ maxWeeklyLessons: null, planningPeriods: 0, version: 3 });
    });

    it.each([
      [{ maxWeeklyLessons: 0 }, 'A carga máxima deve ser um número inteiro de 1 a 60'],
      [{ maxWeeklyLessons: 61 }, 'A carga máxima deve ser um número inteiro de 1 a 60'],
      [{ maxWeeklyLessons: 20.5 }, 'A carga máxima deve ser um número inteiro de 1 a 60'],
      [{ planningPeriods: -1 }, 'A hora-atividade deve ser um número inteiro de 0 a 40'],
      [{ planningPeriods: 41 }, 'A hora-atividade deve ser um número inteiro de 0 a 40'],
    ])('rejeita valores fora do intervalo (%j)', async (workload, message) => {
      const error = await register({ name: 'Ana', subjectIds: [], ...workload }).catch(
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(InvalidWorkloadError);
      expect((error as Error).message).toContain(message);
      expect(teachers.items.size).toBe(0);
    });
  });

  describe('horários indisponíveis', () => {
    it('substitui os horários, sem repetições e ordenados pelo dia', async () => {
      await register({ name: 'Ana', subjectIds: [] });

      const changed = await changeAvailability({
        id: 't-1',
        version: 1,
        unavailable: [
          { weekday: 3, periodId: 'p2' },
          { weekday: 1, periodId: 'p1' },
          { weekday: 3, periodId: 'p2' },
        ],
      });

      expect(changed.unavailable).toEqual([
        { weekday: 1, periodId: 'p1' },
        { weekday: 3, periodId: 'p2' },
      ]);
      expect(changed.version).toBe(2);

      const cleared = await changeAvailability({ id: 't-1', version: 2, unavailable: [] });
      expect(cleared.unavailable).toEqual([]);
    });

    it.each([
      ['aula inexistente', { weekday: 1, periodId: 'removida' }],
      ['sábado', { weekday: 6, periodId: 'p1' }],
      ['dia zero', { weekday: 0, periodId: 'p1' }],
    ])('recusa %s', async (_case, slot) => {
      await register({ name: 'Ana', subjectIds: [] });

      await expect(
        changeAvailability({ id: 't-1', version: 1, unavailable: [slot] }),
      ).rejects.toThrow(InvalidAvailabilityError);
    });

    it('usa controle de versão e informa professor inexistente', async () => {
      await register({ name: 'Ana', subjectIds: [] });
      await changeAvailability({ id: 't-1', version: 1, unavailable: [] });

      await expect(changeAvailability({ id: 't-1', version: 1, unavailable: [] })).rejects.toThrow(
        StaleVersionError,
      );
      await expect(changeAvailability({ id: 'x', version: 1, unavailable: [] })).rejects.toThrow(
        TeacherNotFoundError,
      );
    });

    it('editar nome e habilitações preserva os horários indisponíveis', async () => {
      await register({ name: 'Ana', subjectIds: [] });
      await changeAvailability({
        id: 't-1',
        version: 1,
        unavailable: [{ weekday: 5, periodId: 'p3' }],
      });

      const renamed = await update({ id: 't-1', version: 2, name: 'Ana S.', subjectIds: [] });

      expect(renamed.unavailable).toEqual([{ weekday: 5, periodId: 'p3' }]);
    });
  });
});
