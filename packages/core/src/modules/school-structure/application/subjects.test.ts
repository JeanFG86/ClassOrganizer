import { beforeEach, describe, expect, it } from 'vitest';
import {
  InvalidSubjectNameError,
  SubjectNameAlreadyInUseError,
  type Subject,
} from '../domain/subject.ts';
import { makeListSubjects } from './list-subjects.ts';
import { makeRegisterSubject } from './register-subject.ts';
import type { SubjectRepository } from './subject-repository.ts';

class InMemorySubjectRepository implements SubjectRepository {
  readonly items: Subject[] = [];

  async existsWithNormalizedName(normalizedName: string): Promise<boolean> {
    return this.items.some((s) => s.normalizedName === normalizedName);
  }

  async add(subject: Subject): Promise<void> {
    this.items.push(subject);
  }

  async listAll(): Promise<Subject[]> {
    return [...this.items];
  }
}

const now = new Date('2026-02-01T12:00:00Z');

describe('cadastro de disciplinas', () => {
  let subjects: InMemorySubjectRepository;
  let registerSubject: ReturnType<typeof makeRegisterSubject>;
  let sequence: number;

  beforeEach(() => {
    subjects = new InMemorySubjectRepository();
    sequence = 0;
    registerSubject = makeRegisterSubject({
      subjects,
      clock: { now: () => now },
      ids: { next: () => `id-${++sequence}` },
    });
  });

  it('cadastra a disciplina com id e data injetados', async () => {
    const subject = await registerSubject({ name: 'Matemática' });

    expect(subject).toEqual({
      id: 'id-1',
      name: 'Matemática',
      normalizedName: 'matematica',
      createdAt: now,
    });
    expect(subjects.items).toEqual([subject]);
  });

  it('impede nome equivalente a uma disciplina existente', async () => {
    await registerSubject({ name: 'Matemática' });

    await expect(registerSubject({ name: '  MATEMATICA ' })).rejects.toThrow(
      SubjectNameAlreadyInUseError,
    );
    expect(subjects.items).toHaveLength(1);
  });

  it('não grava quando o nome é inválido', async () => {
    await expect(registerSubject({ name: ' ' })).rejects.toThrow(InvalidSubjectNameError);
    expect(subjects.items).toHaveLength(0);
  });

  it('lista em ordem alfabética respeitando acentos', async () => {
    for (const name of ['Química', 'Artes', 'Ética', 'Biologia']) {
      await registerSubject({ name });
    }

    const names = (await makeListSubjects({ subjects })()).map((s) => s.name);

    expect(names).toEqual(['Artes', 'Biologia', 'Ética', 'Química']);
  });
});
