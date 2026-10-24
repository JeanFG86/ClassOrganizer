import {
  StaleVersionError,
  UnknownSubjectError,
  createSubject,
  createTeacher,
} from '@classorganizer/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDatabase } from '../../testing/postgres-container.ts';
import type { TestDatabase } from '../../testing/postgres-container.ts';
import { PrismaSubjectRepository } from '../../persistence/prisma-subject-repository.ts';
import { PrismaTeacherRepository } from './prisma-teacher-repository.ts';

const createdAt = new Date('2026-02-01T12:00:00.000Z');
const MATH = '11111111-1111-4111-8111-111111111111';
const HISTORY = '22222222-2222-4222-8222-222222222222';
const MISSING = '99999999-9999-4999-8999-999999999999';
const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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
    const teacher = createTeacher({ id: ANA, name: 'Ana', subjectIds: [HISTORY, MATH], createdAt });

    await teachers.add(teacher);

    expect(await teachers.listAll()).toEqual([teacher]);
    expect(await teachers.findById(ANA)).toEqual(teacher);
    expect(await teachers.findById('não-é-uuid')).toBeNull();
  });

  it('não grava nada quando uma disciplina não existe (atomicidade)', async () => {
    const teacher = createTeacher({ id: ANA, name: 'Ana', subjectIds: [MATH, MISSING], createdAt });

    await expect(teachers.add(teacher)).rejects.toThrow(UnknownSubjectError);
    expect(await teachers.listAll()).toEqual([]);
  });

  it('substitui dados e habilitações incrementando a versão', async () => {
    const teacher = createTeacher({ id: ANA, name: 'Ana', subjectIds: [MATH], createdAt });
    await teachers.add(teacher);

    const saved = await teachers.update({
      ...teacher,
      name: 'Ana Souza',
      subjectIds: [HISTORY],
      archivedAt: createdAt,
    });

    expect(saved.version).toBe(2);
    expect(await teachers.findById(ANA)).toEqual(saved);
  });

  it('rejeita versão antiga sem tocar nas habilitações', async () => {
    const teacher = createTeacher({ id: ANA, name: 'Ana', subjectIds: [MATH], createdAt });
    await teachers.add(teacher);
    await teachers.update({ ...teacher, subjectIds: [HISTORY] });

    await expect(teachers.update({ ...teacher, subjectIds: [] })).rejects.toThrow(
      StaleVersionError,
    );
    expect((await teachers.findById(ANA))?.subjectIds).toEqual([HISTORY]);
  });

  it('desfaz a atualização inteira se uma habilitação for inválida', async () => {
    const teacher = createTeacher({ id: ANA, name: 'Ana', subjectIds: [MATH], createdAt });
    await teachers.add(teacher);

    await expect(
      teachers.update({ ...teacher, name: 'Outro nome', subjectIds: [MATH, MISSING] }),
    ).rejects.toThrow(UnknownSubjectError);
    expect(await teachers.findById(ANA)).toEqual(teacher);
  });

  it('em gravações simultâneas da mesma versão, só uma vence', async () => {
    const teacher = createTeacher({ id: ANA, name: 'Ana', subjectIds: [MATH], createdAt });
    await teachers.add(teacher);

    const results = await Promise.allSettled([
      teachers.update({ ...teacher, subjectIds: [HISTORY] }),
      teachers.update({ ...teacher, subjectIds: [MATH, HISTORY] }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const saved = await teachers.findById(ANA);
    expect(saved?.version).toBe(2);
    const winner = results.find((r) => r.status === 'fulfilled');
    expect(saved?.subjectIds).toEqual(winner?.value.subjectIds);
  });

  it('o banco impede excluir disciplina usada em habilitação', async () => {
    await teachers.add(createTeacher({ id: ANA, name: 'Ana', subjectIds: [MATH], createdAt }));

    await expect(testDb.db.subject.delete({ where: { id: MATH } })).rejects.toThrow();
  });
});
