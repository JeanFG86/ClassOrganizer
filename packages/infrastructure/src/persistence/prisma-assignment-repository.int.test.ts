import {
  AssignmentAlreadyExistsError,
  InvalidAssignmentReferenceError,
  QualificationInUseError,
  StaleVersionError,
  createAssignment,
  createClassGroup,
  createSubject,
  createTeacher,
} from '@classorganizer/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDatabase } from '../testing/postgres-container.ts';
import type { TestDatabase } from '../testing/postgres-container.ts';
import { PrismaAssignmentRepository } from './prisma-assignment-repository.ts';
import { PrismaClassGroupRepository } from './prisma-class-group-repository.ts';
import { PrismaSubjectRepository } from './prisma-subject-repository.ts';
import { PrismaTeacherRepository } from './prisma-teacher-repository.ts';

const createdAt = new Date('2026-02-01T12:00:00.000Z');
const MATH = '11111111-1111-4111-8111-111111111111';
const HISTORY = '22222222-2222-4222-8222-222222222222';
const C6A = '6a6a6a6a-6a6a-4a6a-8a6a-6a6a6a6a6a6a';
const C6B = '6b6b6b6b-6b6b-4b6b-8b6b-6b6b6b6b6b6b';
const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BRUNO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const A1 = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const A2 = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';

describe('PrismaAssignmentRepository (PostgreSQL)', () => {
  let testDb: TestDatabase;
  let assignments: PrismaAssignmentRepository;
  let teachers: PrismaTeacherRepository;

  const mathFor6A = () =>
    createAssignment({
      id: A1,
      classGroupId: C6A,
      subjectId: MATH,
      teacherId: ANA,
      weeklyLessons: 5,
      createdAt,
    });

  async function loadAna() {
    const teacher = await teachers.findById(ANA);
    if (!teacher) throw new Error('professor de teste não encontrado');
    return teacher;
  }

  beforeAll(async () => {
    testDb = await startTestDatabase();
    assignments = new PrismaAssignmentRepository(testDb.db);
    teachers = new PrismaTeacherRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb?.stop();
  });

  beforeEach(async () => {
    await testDb.truncateAll();
    const subjects = new PrismaSubjectRepository(testDb.db);
    const classGroups = new PrismaClassGroupRepository(testDb.db);
    await subjects.add(createSubject({ id: MATH, name: 'Matemática', createdAt }));
    await subjects.add(createSubject({ id: HISTORY, name: 'História', createdAt }));
    await classGroups.add(createClassGroup({ id: C6A, name: '6º ano A', createdAt }));
    await classGroups.add(createClassGroup({ id: C6B, name: '6º ano B', createdAt }));
    await teachers.add(
      createTeacher({ id: ANA, name: 'Ana', subjectIds: [MATH, HISTORY], createdAt }),
    );
    await teachers.add(
      createTeacher({ id: BRUNO, name: 'Bruno', subjectIds: [HISTORY], createdAt }),
    );
  });

  it('grava, busca e lista a atribuição', async () => {
    const assignment = mathFor6A();

    await assignments.add(assignment);

    expect(await assignments.findById(A1)).toEqual(assignment);
    expect(await assignments.listAll()).toEqual([assignment]);
    expect(await assignments.subjectIdsAssignedTo(ANA)).toEqual(new Set([MATH]));
    expect(await assignments.subjectIdsAssignedTo(BRUNO)).toEqual(new Set());
  });

  it('o banco garante um professor por disciplina em cada turma', async () => {
    await assignments.add(mathFor6A());

    await expect(assignments.add({ ...mathFor6A(), id: A2 })).rejects.toThrow(
      AssignmentAlreadyExistsError,
    );
    await expect(assignments.add({ ...mathFor6A(), id: A2, classGroupId: C6B })).resolves.toBe(
      undefined,
    );
  });

  it('o banco recusa professor não habilitado (FK composta)', async () => {
    await expect(assignments.add({ ...mathFor6A(), teacherId: BRUNO })).rejects.toThrow(
      InvalidAssignmentReferenceError,
    );
  });

  it('o banco recusa carga fora de 1..40', async () => {
    await expect(
      testDb.db.teachingAssignment.create({ data: { ...mathFor6A(), weeklyLessons: 41 } }),
    ).rejects.toThrow(/teaching_assignment_weekly_lessons_range/);
  });

  it('atualiza e remove respeitando a versão', async () => {
    const assignment = mathFor6A();
    await assignments.add(assignment);

    const saved = await assignments.update({ ...assignment, weeklyLessons: 4 });
    expect(saved).toMatchObject({ weeklyLessons: 4, version: 2 });
    await expect(assignments.update({ ...assignment, weeklyLessons: 3 })).rejects.toThrow(
      StaleVersionError,
    );

    await expect(assignments.remove(assignment)).rejects.toThrow(StaleVersionError);
    await assignments.remove(saved);
    expect(await assignments.listAll()).toEqual([]);
  });

  it('o banco impede remover habilitação usada em atribuição, sem alterar o professor', async () => {
    await assignments.add(mathFor6A());
    const ana = await loadAna();

    // Chama o repositório direto, sem a checagem do caso de uso: a garantia é do banco.
    await expect(
      teachers.update({ ...ana, name: 'Ana Souza', subjectIds: [HISTORY] }),
    ).rejects.toThrow(QualificationInUseError);
    expect(await teachers.findById(ANA)).toEqual(ana);
  });

  it('remover habilitação sem atribuição continua funcionando', async () => {
    await assignments.add(mathFor6A());
    const ana = await loadAna();

    const saved = await teachers.update({ ...ana, subjectIds: [MATH] });

    expect((await teachers.findById(ANA))?.subjectIds).toEqual([MATH]);
    expect(saved.version).toBe(2);
  });
});
