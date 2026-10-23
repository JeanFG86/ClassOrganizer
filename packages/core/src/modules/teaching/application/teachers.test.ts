import { beforeEach, describe, expect, it } from 'vitest';
import { InvalidTeacherNameError, UnknownSubjectError, type Teacher } from '../domain/teacher.ts';
import { makeListTeachers } from './list-teachers.ts';
import type { SubjectLookup, TeacherRepository } from './ports.ts';
import { makeRegisterTeacher } from './register-teacher.ts';

class InMemoryTeacherRepository implements TeacherRepository {
  readonly items: Teacher[] = [];

  async add(teacher: Teacher): Promise<void> {
    this.items.push(teacher);
  }

  async listAll(): Promise<Teacher[]> {
    return [...this.items];
  }
}

const now = new Date('2026-02-01T12:00:00Z');

describe('cadastro de professores', () => {
  let teachers: InMemoryTeacherRepository;
  let registerTeacher: ReturnType<typeof makeRegisterTeacher>;
  const knownSubjects = new Set(['math', 'history']);
  const subjects: SubjectLookup = {
    existingSubjectIds: async (ids) => new Set(ids.filter((id) => knownSubjects.has(id))),
  };

  beforeEach(() => {
    teachers = new InMemoryTeacherRepository();
    let sequence = 0;
    registerTeacher = makeRegisterTeacher({
      teachers,
      subjects,
      clock: { now: () => now },
      ids: { next: () => `t-${++sequence}` },
    });
  });

  it('cadastra o professor com as habilitações informadas', async () => {
    const teacher = await registerTeacher({ name: 'Ana Souza', subjectIds: ['math', 'history'] });

    expect(teacher).toEqual({
      id: 't-1',
      name: 'Ana Souza',
      subjectIds: ['math', 'history'],
      createdAt: now,
    });
    expect(teachers.items).toEqual([teacher]);
  });

  it('rejeita habilitação em disciplina inexistente sem gravar nada', async () => {
    await expect(
      registerTeacher({ name: 'Ana', subjectIds: ['math', 'removida'] }),
    ).rejects.toThrow(UnknownSubjectError);
    expect(teachers.items).toHaveLength(0);
  });

  it('valida o nome antes de consultar disciplinas', async () => {
    await expect(registerTeacher({ name: ' ', subjectIds: ['math'] })).rejects.toThrow(
      InvalidTeacherNameError,
    );
  });

  it('lista em ordem alfabética', async () => {
    for (const name of ['Zélia', 'Ítalo', 'Bruno']) {
      await registerTeacher({ name, subjectIds: [] });
    }

    const names = (await makeListTeachers({ teachers })()).map((t) => t.name);

    expect(names).toEqual(['Bruno', 'Ítalo', 'Zélia']);
  });
});
