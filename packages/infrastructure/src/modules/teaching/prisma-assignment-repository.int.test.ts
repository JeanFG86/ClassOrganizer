import {
  InvalidAssignmentParticipantsError,
  InvalidAssignmentReferenceError,
  QualificationInUseError,
  StaleVersionError,
  createAssignment,
  createClassGroup,
  createSubject,
  createResource,
  createTeacher,
} from '@classorganizer/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDatabase } from '../../testing/postgres-container.ts';
import type { TestDatabase } from '../../testing/postgres-container.ts';
import { PrismaAssignmentRepository } from './prisma-assignment-repository.ts';
import { PrismaClassGroupRepository } from '../school-structure/prisma-class-group-repository.ts';
import { PrismaResourceRepository } from '../school-structure/prisma-resource-repository.ts';
import { PrismaSubjectRepository } from '../school-structure/prisma-subject-repository.ts';
import { PrismaTeacherRepository } from './prisma-teacher-repository.ts';

const createdAt = new Date('2026-02-01T12:00:00.000Z');
const MATH = '11111111-1111-4111-8111-111111111111';
const HISTORY = '22222222-2222-4222-8222-222222222222';
const C6A = '6a6a6a6a-6a6a-4a6a-8a6a-6a6a6a6a6a6a';
const C6B = '6b6b6b6b-6b6b-4b6b-8b6b-6b6b6b6b6b6b';
const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECOND_TEACHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const A1 = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const A2 = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';
const LAB = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
const COURT = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2';

describe('PrismaAssignmentRepository (PostgreSQL)', () => {
  let testDb: TestDatabase;
  let assignments: PrismaAssignmentRepository;
  let teachers: PrismaTeacherRepository;

  const mathFor6A = () =>
    createAssignment({
      id: A1,
      classGroupId: C6A,
      participants: [{ subjectId: MATH, teacherId: ANA }],
      weeklyLessons: 5,
      resourceIds: [],
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
    const resources = new PrismaResourceRepository(testDb.db);
    await resources.add(createResource({ id: LAB, name: 'Laboratório', createdAt }));
    await resources.add(createResource({ id: COURT, name: 'Quadra', createdAt }));
    await teachers.add(
      createTeacher({ id: SECOND_TEACHER, name: 'Docente Beta', subjectIds: [HISTORY], createdAt }),
    );
  });

  it('grava, busca e lista a atribuição', async () => {
    const assignment = mathFor6A();

    await assignments.add(assignment);

    expect(await assignments.findById(A1)).toEqual(assignment);
    expect(await assignments.listAll()).toEqual([assignment]);
    expect(await assignments.subjectIdsAssignedTo(ANA)).toEqual(new Set([MATH]));
    expect(await assignments.subjectIdsAssignedTo(SECOND_TEACHER)).toEqual(new Set());
  });

  it('permite dividir a mesma disciplina em blocos separados', async () => {
    await assignments.add(mathFor6A());
    await assignments.add({ ...mathFor6A(), id: A2, weeklyLessons: 2 });
    expect(await assignments.listAll()).toHaveLength(2);
  });

  it('grava participantes da mesma disciplina e de disciplinas simultâneas', async () => {
    const assignment = {
      ...mathFor6A(),
      participants: [
        { teacherId: ANA, subjectId: HISTORY },
        { teacherId: SECOND_TEACHER, subjectId: HISTORY },
      ],
    };
    await assignments.add(assignment);
    expect(await assignments.findById(A1)).toEqual(assignment);
    expect(await assignments.subjectIdsAssignedTo(SECOND_TEACHER)).toEqual(new Set([HISTORY]));
    // O segundo participante também protege a habilitação.
    const current = await teachers.findById(SECOND_TEACHER);
    if (!current) throw new Error('Professor de teste ausente.');
    await expect(teachers.update({ ...current, subjectIds: [] })).rejects.toThrow(
      QualificationInUseError,
    );
  });

  it('o banco impede professor repetido no bloco', async () => {
    await expect(
      assignments.add({
        ...mathFor6A(),
        participants: [
          { teacherId: ANA, subjectId: MATH },
          { teacherId: ANA, subjectId: HISTORY },
        ],
      }),
    ).rejects.toThrow(InvalidAssignmentParticipantsError);
    expect(await assignments.listAll()).toEqual([]);
  });

  it('o banco recusa professor não habilitado (FK composta)', async () => {
    await expect(
      assignments.add({
        ...mathFor6A(),
        participants: [
          { teacherId: ANA, subjectId: MATH },
          { teacherId: SECOND_TEACHER, subjectId: MATH },
        ],
      }),
    ).rejects.toThrow(InvalidAssignmentReferenceError);
  });

  it('o banco recusa carga fora de 1..40', async () => {
    await expect(assignments.add({ ...mathFor6A(), weeklyLessons: 41 })).rejects.toThrow(
      /teaching_assignment_weekly_lessons_range/,
    );
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

  it('o banco impede bloco vazio e remoção direta do último participante', async () => {
    await expect(assignments.add({ ...mathFor6A(), participants: [] })).rejects.toThrow();
    expect(await assignments.listAll()).toEqual([]);
    await assignments.add(mathFor6A());
    await expect(
      testDb.db.assignmentParticipant.deleteMany({ where: { assignmentId: A1 } }),
    ).rejects.toThrow();
    expect(await assignments.findById(A1)).toEqual(mathFor6A());
    await expect(assignments.update({ ...mathFor6A(), participants: [] })).rejects.toThrow();
    expect(await assignments.findById(A1)).toEqual(mathFor6A());
  });

  it('o banco recusa posição negativa sem alterar a participação', async () => {
    await assignments.add(mathFor6A());
    await expect(
      testDb.db.assignmentParticipant.updateMany({
        where: { assignmentId: A1 },
        data: { position: -1 },
      }),
    ).rejects.toThrow(/assignment_participant_position_nonnegative/);
    expect(await assignments.findById(A1)).toEqual(mathFor6A());
  });

  it('edição por diferença preserva participantes mantidos e a ordem', async () => {
    const original = {
      ...mathFor6A(),
      participants: [
        { teacherId: ANA, subjectId: MATH },
        { teacherId: SECOND_TEACHER, subjectId: HISTORY },
      ],
    };
    await assignments.add(original);
    const saved = await assignments.update({
      ...original,
      participants: [
        { teacherId: SECOND_TEACHER, subjectId: HISTORY },
        { teacherId: ANA, subjectId: HISTORY },
      ],
      weeklyLessons: 3,
    });
    expect(await assignments.findById(A1)).toEqual(saved);
    expect(await assignments.subjectIdsAssignedTo(ANA)).toEqual(new Set([HISTORY]));
    const reduced = await assignments.update({
      ...saved,
      participants: [{ teacherId: SECOND_TEACHER, subjectId: HISTORY }],
    });
    expect(await assignments.findById(A1)).toEqual(reduced);
    expect(await assignments.subjectIdsAssignedTo(ANA)).toEqual(new Set());
    await assignments.remove(reduced);
    expect(await testDb.db.assignmentParticipant.count()).toBe(0);
  });

  it('grava e edita os recursos do bloco por diferença, na ordem informada', async () => {
    const original = { ...mathFor6A(), resourceIds: [LAB] };
    await assignments.add(original);
    expect(await assignments.findById(A1)).toEqual(original);
    const both = await assignments.update({ ...original, resourceIds: [COURT, LAB] });
    expect((await assignments.findById(A1))?.resourceIds).toEqual([COURT, LAB]);
    const none = await assignments.update({ ...both, resourceIds: [] });
    expect(await assignments.findById(A1)).toEqual(none);
    expect(await testDb.db.assignmentResource.count()).toBe(0);
  });

  it('o banco recusa recurso inexistente e protege recurso em uso', async () => {
    await expect(
      assignments.add({ ...mathFor6A(), resourceIds: ['c9c9c9c9-c9c9-4c9c-8c9c-c9c9c9c9c9c9'] }),
    ).rejects.toThrow(InvalidAssignmentReferenceError);
    expect(await assignments.findById(A1)).toBeNull();
    await assignments.add({ ...mathFor6A(), resourceIds: [LAB] });
    await expect(testDb.db.resource.delete({ where: { id: LAB } })).rejects.toThrow();
    await expect(
      testDb.db.assignmentResource.update({
        where: { assignmentId_resourceId: { assignmentId: A1, resourceId: LAB } },
        data: { position: 5 },
      }),
    ).rejects.toThrow(/assignment_resource_position_range/);
    await assignments.remove({ ...mathFor6A(), resourceIds: [LAB] });
    expect(await testDb.db.assignmentResource.count()).toBe(0);
  });

  it('falha de habilitação reverte participantes, carga e versão juntos', async () => {
    const original = mathFor6A();
    await assignments.add(original);
    await expect(
      assignments.update({
        ...original,
        weeklyLessons: 2,
        participants: [{ teacherId: SECOND_TEACHER, subjectId: MATH }],
      }),
    ).rejects.toThrow(InvalidAssignmentReferenceError);
    expect(await assignments.findById(A1)).toEqual(original);
  });

  it('duas edições concorrentes não misturam os participantes', async () => {
    const original = mathFor6A();
    await assignments.add(original);
    const attempts = await Promise.allSettled([
      assignments.update({
        ...original,
        weeklyLessons: 2,
        participants: [{ teacherId: ANA, subjectId: HISTORY }],
      }),
      assignments.update({
        ...original,
        weeklyLessons: 3,
        participants: [{ teacherId: SECOND_TEACHER, subjectId: HISTORY }],
      }),
    ]);
    const saved = attempts.find((r) => r.status === 'fulfilled');
    const rejected = attempts.find((r) => r.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(StaleVersionError);
    expect(saved?.status === 'fulfilled' && (await assignments.findById(A1))).toEqual(
      saved?.status === 'fulfilled' && saved.value,
    );
  });
});
