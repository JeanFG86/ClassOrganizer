import { UnknownSubjectError, createSubject, createTeacher } from '@classorganizer/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDatabase } from '../testing/postgres-container.ts';
import type { TestDatabase } from '../testing/postgres-container.ts';
import { PrismaSubjectRepository } from './prisma-subject-repository.ts';
import { PrismaTeacherRepository } from './prisma-teacher-repository.ts';

const createdAt = new Date('2026-02-01T12:00:00.000Z');
const MATH = '11111111-1111-4111-8111-111111111111';
const HISTORY = '22222222-2222-4222-8222-222222222222';
const MISSING = '99999999-9999-4999-8999-999999999999';

describe('PrismaTeacherRepository (PostgreSQL)', () => {
  let testDb: TestDatabase;
  let subjects: PrismaSubjectRepository;
  let teachers: PrismaTeacherRepository;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    subjects = new PrismaSubjectRepository(testDb.db);
    teachers = new PrismaTeacherRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.truncateAll();
    await subjects.add(createSubject({ id: MATH, name: 'Matemática', createdAt }));
    await subjects.add(createSubject({ id: HISTORY, name: 'História', createdAt }));
  });

  it('grava e recupera o professor com as habilitações na ordem informada', async () => {
    const teacher = createTeacher({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Ana Souza',
      subjectIds: [HISTORY, MATH],
      createdAt,
    });

    await teachers.add(teacher);

    expect(await teachers.listAll()).toEqual([teacher]);
  });

  it('grava professor sem habilitações', async () => {
    const teacher = createTeacher({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: 'Bruno',
      subjectIds: [],
      createdAt,
    });

    await teachers.add(teacher);

    expect(await teachers.listAll()).toEqual([teacher]);
  });

  it('não grava nada quando uma disciplina não existe (atomicidade)', async () => {
    const teacher = createTeacher({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      name: 'Carla',
      subjectIds: [MATH, MISSING],
      createdAt,
    });

    await expect(teachers.add(teacher)).rejects.toThrow(UnknownSubjectError);
    expect(await teachers.listAll()).toEqual([]);
  });

  it('o banco impede excluir disciplina usada em habilitação', async () => {
    await teachers.add(
      createTeacher({
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        name: 'Davi',
        subjectIds: [MATH],
        createdAt,
      }),
    );

    await expect(testDb.db.subject.delete({ where: { id: MATH } })).rejects.toThrow();
  });

  it('SubjectLookup devolve apenas ids existentes, tolerando ids inválidos', async () => {
    const found = await subjects.existingSubjectIds([MATH, MISSING, 'não-é-uuid']);

    expect(found).toEqual(new Set([MATH]));
  });
});
