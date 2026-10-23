import { beforeEach, describe, expect, it } from 'vitest';
import type { EntityStatus } from '../../../shared/archiving.ts';
import { StaleVersionError } from '../../../shared/versioning.ts';
import { InMemoryAssignmentRepository } from '../../../testing/in-memory-repositories.ts';
import {
  AssignmentAlreadyExistsError,
  AssignmentNotFoundError,
  InvalidAssignmentReferenceError,
  InvalidWeeklyLessonsError,
  TeacherNotQualifiedError,
} from '../domain/assignment.ts';
import { createTeacher, type Teacher } from '../domain/teacher.ts';
import {
  makeAssignTeaching,
  makeChangeAssignment,
  makeListAssignments,
  makeRemoveAssignment,
} from './assignments.ts';
import type { TeacherRepository } from './ports.ts';

const now = new Date('2026-02-01T12:00:00Z');

function teacher(id: string, subjectIds: string[], archived = false): Teacher {
  return {
    ...createTeacher({ id, name: id, subjectIds, createdAt: now }),
    archivedAt: archived ? now : null,
  };
}

describe('atribuições de ensino', () => {
  let assignments: InMemoryAssignmentRepository;
  let teachersById: Map<string, Teacher>;
  let subjectStatus: Map<string, EntityStatus>;
  let classGroupStatus: Map<string, EntityStatus>;
  let assign: ReturnType<typeof makeAssignTeaching>;
  let change: ReturnType<typeof makeChangeAssignment>;
  let remove: ReturnType<typeof makeRemoveAssignment>;

  const valid = { classGroupId: '6A', subjectId: 'math', teacherId: 'ana', weeklyLessons: 5 };

  beforeEach(() => {
    assignments = new InMemoryAssignmentRepository();
    teachersById = new Map([
      ['ana', teacher('ana', ['math', 'physics'])],
      ['bruno', teacher('bruno', ['math'])],
      ['carla', teacher('carla', ['history'])],
      ['davi', teacher('davi', ['math'], true)],
    ]);
    subjectStatus = new Map([
      ['math', 'active'],
      ['physics', 'active'],
      ['latin', 'archived'],
    ]);
    classGroupStatus = new Map([
      ['6A', 'active'],
      ['6B', 'active'],
      ['5A', 'archived'],
    ]);
    const teachers: Pick<TeacherRepository, 'findById'> = {
      findById: async (id) => teachersById.get(id) ?? null,
    };
    const deps = {
      assignments,
      teachers: teachers as TeacherRepository,
      subjects: {
        subjectStatuses: async (ids: readonly string[]) => {
          const found = new Map<string, EntityStatus>();
          for (const id of ids) {
            const status = subjectStatus.get(id);
            if (status) found.set(id, status);
          }
          return found;
        },
      },
      classGroups: { classGroupStatus: async (id: string) => classGroupStatus.get(id) },
    };
    let sequence = 0;
    assign = makeAssignTeaching({
      ...deps,
      clock: { now: () => now },
      ids: { next: () => `a-${++sequence}` },
    });
    change = makeChangeAssignment(deps);
    remove = makeRemoveAssignment(deps);
  });

  describe('atribuir', () => {
    it('atribui professor habilitado com a carga semanal', async () => {
      const assignment = await assign(valid);

      expect(assignment).toEqual({ id: 'a-1', ...valid, createdAt: now, version: 1 });
      expect(await makeListAssignments({ assignments })()).toEqual([assignment]);
    });

    it.each([0, -1, 2.5, 41, Number.NaN])('rejeita carga semanal inválida (%s)', async (n) => {
      await expect(assign({ ...valid, weeklyLessons: n })).rejects.toThrow(
        InvalidWeeklyLessonsError,
      );
    });

    it('aceita carga nos limites 1 e 40', async () => {
      await expect(assign({ ...valid, weeklyLessons: 1 })).resolves.toBeDefined();
      await expect(
        assign({ ...valid, classGroupId: '6B', weeklyLessons: 40 }),
      ).resolves.toBeDefined();
    });

    it('exige professor habilitado na disciplina', async () => {
      await expect(assign({ ...valid, teacherId: 'carla' })).rejects.toThrow(
        TeacherNotQualifiedError,
      );
    });

    it.each([
      ['turma inexistente', { classGroupId: 'nada' }, 'A turma selecionada não existe mais.'],
      ['turma arquivada', { classGroupId: '5A' }, 'A turma selecionada está arquivada.'],
      [
        'disciplina inexistente',
        { subjectId: 'nada' },
        'A disciplina selecionada não existe mais.',
      ],
      ['disciplina arquivada', { subjectId: 'latin' }, 'A disciplina selecionada está arquivada.'],
      ['professor inexistente', { teacherId: 'nada' }, 'O professor selecionado não existe mais.'],
      ['professor arquivado', { teacherId: 'davi' }, 'O professor selecionado está arquivado.'],
    ])('rejeita %s', async (_label, override, message) => {
      const attempt = assign({ ...valid, ...override });

      await expect(attempt).rejects.toThrow(InvalidAssignmentReferenceError);
      await expect(attempt).rejects.toThrow(message);
      expect(assignments.store.items.size).toBe(0);
    });

    it('só um professor por disciplina em cada turma', async () => {
      await assign(valid);

      await expect(assign({ ...valid, teacherId: 'bruno' })).rejects.toThrow(
        AssignmentAlreadyExistsError,
      );
      await expect(assign({ ...valid, classGroupId: '6B' })).resolves.toBeDefined();
      await expect(assign({ ...valid, subjectId: 'physics' })).resolves.toBeDefined();
    });
  });

  describe('alterar', () => {
    it('troca professor e carga incrementando a versão', async () => {
      const assignment = await assign(valid);

      const changed = await change({
        id: assignment.id,
        version: 1,
        teacherId: 'bruno',
        weeklyLessons: 4,
      });

      expect(changed).toMatchObject({ teacherId: 'bruno', weeklyLessons: 4, version: 2 });
    });

    it('novo professor também precisa ser habilitado', async () => {
      const assignment = await assign(valid);

      await expect(
        change({ id: assignment.id, version: 1, teacherId: 'carla', weeklyLessons: 5 }),
      ).rejects.toThrow(TeacherNotQualifiedError);
    });

    it('respeita a versão', async () => {
      const assignment = await assign(valid);
      await change({ id: assignment.id, version: 1, teacherId: 'ana', weeklyLessons: 4 });

      await expect(
        change({ id: assignment.id, version: 1, teacherId: 'ana', weeklyLessons: 3 }),
      ).rejects.toThrow(StaleVersionError);
    });
  });

  describe('remover', () => {
    it('remove com a versão atual', async () => {
      const assignment = await assign(valid);

      await expect(remove({ id: assignment.id, version: 2 })).rejects.toThrow(StaleVersionError);
      await remove({ id: assignment.id, version: 1 });

      expect(assignments.store.items.size).toBe(0);
      await expect(remove({ id: assignment.id, version: 1 })).rejects.toThrow(
        AssignmentNotFoundError,
      );
    });
  });
});
