import { bindUseCase } from '../../../shared/use-case.ts';
import { beforeEach, describe, expect, it } from 'vitest';
import { StaleVersionError } from '../../../shared/versioning.ts';
import { InMemoryAssignmentRepository } from '../../../testing/in-memory-repositories.ts';
import { createAssignment } from '../domain/assignment.ts';
import {
  QualificationInUseError,
  TeacherHasAssignmentsError,
  ArchivedSubjectError,
  InvalidTeacherNameError,
  TeacherNotFoundError,
  UnknownSubjectError,
  type SubjectStatus,
  type Teacher,
} from '../domain/teacher.ts';
import { ArchiveTeacher, RestoreTeacher, UpdateTeacher } from './usecases/change-teacher.ts';
import { ListTeachers } from './usecases/list-teachers.ts';
import type { SubjectLookup, TeacherRepository } from './ports/index.ts';
import { RegisterTeacher } from './usecases/register-teacher.ts';

class InMemoryTeacherRepository implements TeacherRepository {
  readonly items = new Map<string, Teacher>();

  async findById(id: string): Promise<Teacher | null> {
    return this.items.get(id) ?? null;
  }

  async add(teacher: Teacher): Promise<void> {
    this.items.set(teacher.id, teacher);
  }

  async update(teacher: Teacher): Promise<Teacher> {
    if (this.items.get(teacher.id)?.version !== teacher.version) {
      throw new StaleVersionError();
    }
    const saved = { ...teacher, version: teacher.version + 1 };
    this.items.set(teacher.id, saved);
    return saved;
  }

  async listAll(): Promise<Teacher[]> {
    return [...this.items.values()];
  }
}

const now = new Date('2026-02-01T12:00:00Z');

describe('professores', () => {
  let teachers: InMemoryTeacherRepository;
  let subjectStatus: Map<string, SubjectStatus>;
  let registerTeacher: RegisterTeacher['execute'];
  let updateTeacher: UpdateTeacher['execute'];
  let archive: ArchiveTeacher['execute'];
  let assignments: InMemoryAssignmentRepository;
  let restore: RestoreTeacher['execute'];

  beforeEach(() => {
    teachers = new InMemoryTeacherRepository();
    assignments = new InMemoryAssignmentRepository();
    subjectStatus = new Map([
      ['math', 'active'],
      ['history', 'active'],
      ['latin', 'archived'],
    ]);
    const subjects: SubjectLookup = {
      subjectStatuses: async (ids) => {
        const found = new Map<string, SubjectStatus>();
        for (const id of ids) {
          const status = subjectStatus.get(id);
          if (status) found.set(id, status);
        }
        return found;
      },
    };
    const clock = { now: () => now };
    let sequence = 0;
    registerTeacher = bindUseCase(
      new RegisterTeacher({
        teachers,
        subjects,
        clock,
        ids: { next: () => `t-${++sequence}` },
      }),
    );
    updateTeacher = bindUseCase(new UpdateTeacher({ teachers, subjects, assignments }));
    archive = bindUseCase(new ArchiveTeacher({ teachers, assignments, clock }));
    restore = bindUseCase(new RestoreTeacher({ teachers }));
  });

  describe('cadastro', () => {
    it('cadastra ativo, na versão 1, com as habilitações informadas', async () => {
      const teacher = await registerTeacher({ name: 'Ana Souza', subjectIds: ['math', 'history'] });

      expect(teacher).toEqual({
        id: 't-1',
        name: 'Ana Souza',
        subjectIds: ['math', 'history'],
        maxWeeklyLessons: null,
        planningPeriods: 0,
        unavailable: [],
        createdAt: now,
        archivedAt: null,
        version: 1,
      });
      expect([...teachers.items.values()]).toEqual([teacher]);
    });

    it('rejeita disciplina inexistente sem gravar nada', async () => {
      await expect(
        registerTeacher({ name: 'Ana', subjectIds: ['math', 'removida'] }),
      ).rejects.toThrow(UnknownSubjectError);
      expect(teachers.items.size).toBe(0);
    });

    it('rejeita habilitação em disciplina arquivada', async () => {
      await expect(registerTeacher({ name: 'Ana', subjectIds: ['latin'] })).rejects.toThrow(
        ArchivedSubjectError,
      );
    });

    it('valida o nome', async () => {
      await expect(registerTeacher({ name: ' ', subjectIds: ['math'] })).rejects.toThrow(
        InvalidTeacherNameError,
      );
    });

    it('lista em ordem alfabética', async () => {
      for (const name of ['Zélia', 'Ítalo', 'Bruno']) {
        await registerTeacher({ name, subjectIds: [] });
      }

      const names = (await bindUseCase(new ListTeachers({ teachers }))()).map((t) => t.name);

      expect(names).toEqual(['Bruno', 'Ítalo', 'Zélia']);
    });
  });

  describe('edição', () => {
    it('substitui nome e habilitações e incrementa a versão', async () => {
      const ana = await registerTeacher({ name: 'Ana', subjectIds: ['math'] });

      const updated = await updateTeacher({
        id: ana.id,
        version: 1,
        name: 'Ana Souza',
        subjectIds: ['history'],
      });

      expect(updated).toMatchObject({ name: 'Ana Souza', subjectIds: ['history'], version: 2 });
    });

    it('mantém habilitação em disciplina que foi arquivada depois', async () => {
      subjectStatus.set('latin', 'active');
      const ana = await registerTeacher({ name: 'Ana', subjectIds: ['latin'] });
      subjectStatus.set('latin', 'archived');

      await expect(
        updateTeacher({ id: ana.id, version: 1, name: 'Ana S.', subjectIds: ['latin', 'math'] }),
      ).resolves.toMatchObject({ subjectIds: ['latin', 'math'] });
    });

    it('não acrescenta disciplina arquivada na edição', async () => {
      const ana = await registerTeacher({ name: 'Ana', subjectIds: ['math'] });

      await expect(
        updateTeacher({ id: ana.id, version: 1, name: 'Ana', subjectIds: ['math', 'latin'] }),
      ).rejects.toThrow(ArchivedSubjectError);
    });

    it('rejeita versão antiga sem gravar', async () => {
      const ana = await registerTeacher({ name: 'Ana', subjectIds: [] });
      await updateTeacher({ id: ana.id, version: 1, name: 'Ana Souza', subjectIds: [] });

      await expect(
        updateTeacher({ id: ana.id, version: 1, name: 'Outra', subjectIds: [] }),
      ).rejects.toThrow(StaleVersionError);
      expect((await teachers.findById(ana.id))?.name).toBe('Ana Souza');
    });

    it('informa professor inexistente', async () => {
      await expect(
        updateTeacher({ id: 'nada', version: 1, name: 'X', subjectIds: [] }),
      ).rejects.toThrow(TeacherNotFoundError);
    });
  });

  describe('vínculo com atribuições', () => {
    async function assignAna(subjectId: string) {
      const ana = await registerTeacher({ name: 'Ana', subjectIds: ['math', 'history'] });
      const accompanying = await registerTeacher({
        name: 'Docente teste',
        subjectIds: [subjectId],
      });
      await assignments.add(
        createAssignment({
          id: 'a-1',
          classGroupId: '6A',
          resourceIds: [],
          participants: [
            { subjectId, teacherId: accompanying.id },
            { subjectId, teacherId: ana.id },
          ],
          weeklyLessons: 5,
          createdAt: now,
        }),
      );
      return ana;
    }

    it('não remove habilitação usada em atribuição', async () => {
      const ana = await assignAna('math');

      await expect(
        updateTeacher({ id: ana.id, version: 1, name: 'Ana', subjectIds: ['history'] }),
      ).rejects.toThrow(QualificationInUseError);
    });

    it('remove habilitação sem atribuição normalmente', async () => {
      const ana = await assignAna('math');

      await expect(
        updateTeacher({ id: ana.id, version: 1, name: 'Ana', subjectIds: ['math'] }),
      ).resolves.toMatchObject({ subjectIds: ['math'] });
    });

    it('não arquiva professor com aulas atribuídas', async () => {
      const ana = await assignAna('math');

      await expect(archive({ id: ana.id, version: 1 })).rejects.toThrow(TeacherHasAssignmentsError);
    });
  });

  describe('arquivamento', () => {
    it('arquiva e restaura respeitando a versão', async () => {
      const ana = await registerTeacher({ name: 'Ana', subjectIds: [] });

      const archived = await archive({ id: ana.id, version: 1 });
      expect(archived).toMatchObject({ archivedAt: now, version: 2 });
      await expect(restore({ id: ana.id, version: 1 })).rejects.toThrow(StaleVersionError);

      await expect(restore({ id: ana.id, version: 2 })).resolves.toMatchObject({
        archivedAt: null,
        version: 3,
      });
    });
  });
});
