import { apiErrorSchema, assignmentSchema, classGroupListSchema } from '@classorganizer/contracts';
import {
  InvalidAssignmentParticipantsError,
  ClassGroupNameAlreadyInUseError,
  QualificationInUseError,
  StaleVersionError,
  TeacherHasAssignmentsError,
  TeacherNotQualifiedError,
  createAssignment,
  createClassGroup,
  type ArchiveTeacher,
  type AssignTeaching,
  type ChangeAssignment,
  type ListAssignments,
  type ListClassGroups,
  type RegisterClassGroup,
  type RemoveAssignment,
  type UpdateClassGroup,
  type UpdateTeacher,
} from '@classorganizer/core';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../testing/stub-deps.ts';

const createdAt = new Date('2026-02-01T12:00:00.000Z');
const C6A = '6a6a6a6a-6a6a-4a6a-8a6a-6a6a6a6a6a6a';
const MATH = '11111111-1111-4111-8111-111111111111';
const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const A1 = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const turma = createClassGroup({ id: C6A, name: '6º ano A', createdAt });
const assignment = createAssignment({
  id: A1,
  classGroupId: C6A,
  participants: [{ subjectId: MATH, teacherId: ANA }],
  weeklyLessons: 5,
  resourceIds: [],
  createdAt,
});

describe('API HTTP — turmas e atribuições', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  describe('turmas', () => {
    it('lista no formato do contrato', async () => {
      app = buildTestApp({
        listClassGroups: vi.fn<ListClassGroups['execute']>(async () => [turma]),
      });

      const response = await app.inject({ method: 'GET', url: '/api/v1/class-groups' });

      expect(classGroupListSchema.parse(response.json()).items).toEqual([
        {
          id: C6A,
          name: '6º ano A',
          shiftId: null,
          periodIds: [],
          createdAt: '2026-02-01T12:00:00.000Z',
          archivedAt: null,
          version: 1,
        },
      ]);
    });

    it('cadastra e responde 201; nome repetido responde 409', async () => {
      const registerClassGroup = vi
        .fn<RegisterClassGroup['execute']>()
        .mockResolvedValueOnce(turma)
        .mockRejectedValueOnce(new ClassGroupNameAlreadyInUseError(turma));
      app = buildTestApp({ registerClassGroup });

      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/class-groups',
        payload: { name: '6º ano A' },
      });
      const duplicate = await app.inject({
        method: 'POST',
        url: '/api/v1/class-groups',
        payload: { name: '6º ano A' },
      });

      expect(created.statusCode).toBe(201);
      expect(duplicate.statusCode).toBe(409);
      expect(apiErrorSchema.parse(duplicate.json()).error.code).toBe('class_group.name_in_use');
    });

    it('renomeia com versão', async () => {
      const updateClassGroup = vi.fn<UpdateClassGroup['execute']>(async () => ({
        ...turma,
        version: 2,
      }));
      app = buildTestApp({ updateClassGroup });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/class-groups/${C6A}`,
        payload: { name: '6º ano A', version: 1 },
      });

      expect(response.statusCode).toBe(200);
      expect(updateClassGroup).toHaveBeenCalledWith({ id: C6A, name: '6º ano A', version: 1 });
    });
  });

  describe('atribuições', () => {
    it('lista e cria no formato do contrato', async () => {
      const assignTeaching = vi.fn<AssignTeaching['execute']>(async () => assignment);
      app = buildTestApp({
        assignTeaching,
        listAssignments: vi.fn<ListAssignments['execute']>(async () => [assignment]),
      });
      const payload = {
        classGroupId: C6A,
        participants: [{ subjectId: MATH, teacherId: ANA }],
        weeklyLessons: 5,
      };

      const created = await app.inject({ method: 'POST', url: '/api/v1/assignments', payload });
      const list = await app.inject({ method: 'GET', url: '/api/v1/assignments' });

      expect(created.statusCode).toBe(201);
      expect(assignmentSchema.parse(created.json())).toMatchObject({ ...payload, version: 1 });
      expect(assignTeaching).toHaveBeenCalledWith(payload);
      expect(list.json().items).toHaveLength(1);
    });

    it('preserva disciplinas e professores de todos os participantes no contrato', async () => {
      const payload = {
        classGroupId: C6A,
        weeklyLessons: 2,
        participants: [
          { subjectId: MATH, teacherId: ANA },
          {
            subjectId: '22222222-2222-4222-8222-222222222222',
            teacherId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          },
        ],
      };
      const block = createAssignment({ id: A1, ...payload, resourceIds: [], createdAt });
      const assignTeaching = vi.fn<AssignTeaching['execute']>(async () => block);
      const changeAssignment = vi.fn<ChangeAssignment['execute']>(async () => ({
        ...block,
        version: 2,
      }));
      app = buildTestApp({ assignTeaching, changeAssignment });
      const created = await app.inject({ method: 'POST', url: '/api/v1/assignments', payload });
      expect(created.statusCode).toBe(201);
      expect(assignmentSchema.parse(created.json()).participants).toEqual(payload.participants);
      const changed = await app.inject({
        method: 'PUT',
        url: '/api/v1/assignments/' + A1,
        payload: { participants: payload.participants, weeklyLessons: 2, version: 1 },
      });
      expect(changed.statusCode).toBe(200);
      expect(changeAssignment).toHaveBeenCalledWith({
        id: A1,
        participants: payload.participants,
        weeklyLessons: 2,
        version: 1,
      });
      expect(assignTeaching).toHaveBeenCalledWith(payload);
    });

    it.each([undefined, null, [{ teacherId: ANA }], [{ teacherId: 123, subjectId: MATH }]])(
      'rejeita participantes ausentes ou malformados na fronteira (%j)',
      async (participants) => {
        const assignTeaching = vi.fn<AssignTeaching['execute']>();
        app = buildTestApp({ assignTeaching });
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/assignments',
          payload: { classGroupId: C6A, weeklyLessons: 2, participants },
        });
        expect(response.statusCode).toBe(400);
        expect(assignTeaching).not.toHaveBeenCalled();
      },
    );

    it('carga não numérica é rejeitada na fronteira', async () => {
      const assignTeaching = vi.fn<AssignTeaching['execute']>();
      app = buildTestApp({ assignTeaching });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/assignments',
        payload: {
          classGroupId: C6A,
          participants: [{ subjectId: MATH, teacherId: ANA }],
          weeklyLessons: '5',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(assignTeaching).not.toHaveBeenCalled();
    });

    it.each([
      [new InvalidAssignmentParticipantsError(), 400, 'assignment.invalid_participants'],
      [new TeacherNotQualifiedError(), 400, 'assignment.teacher_not_qualified'],
    ])('traduz %s', async (error, status, code) => {
      app = buildTestApp({
        assignTeaching: async () => {
          throw error;
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/assignments',
        payload: {
          classGroupId: C6A,
          participants: [{ subjectId: MATH, teacherId: ANA }],
          weeklyLessons: 5,
        },
      });

      expect(response.statusCode).toBe(status);
      expect(apiErrorSchema.parse(response.json()).error.code).toBe(code);
    });

    it('altera professor e carga com versão', async () => {
      const changeAssignment = vi.fn<ChangeAssignment['execute']>(async () => ({
        ...assignment,
        version: 2,
      }));
      app = buildTestApp({ changeAssignment });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/assignments/${A1}`,
        payload: {
          participants: [{ subjectId: MATH, teacherId: ANA }],
          weeklyLessons: 4,
          version: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(changeAssignment).toHaveBeenCalledWith({
        id: A1,
        participants: [{ subjectId: MATH, teacherId: ANA }],
        weeklyLessons: 4,
        version: 1,
      });
    });

    it('DELETE remove com a versão na query e responde 204', async () => {
      const removeAssignment = vi.fn<RemoveAssignment['execute']>(async () => {});
      app = buildTestApp({ removeAssignment });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/assignments/${A1}?version=3`,
      });

      expect(response.statusCode).toBe(204);
      expect(removeAssignment).toHaveBeenCalledWith({ id: A1, version: 3 });
    });

    it('DELETE sem versão é rejeitado', async () => {
      const removeAssignment = vi.fn<RemoveAssignment['execute']>();
      app = buildTestApp({ removeAssignment });

      const response = await app.inject({ method: 'DELETE', url: `/api/v1/assignments/${A1}` });

      expect(response.statusCode).toBe(400);
      expect(removeAssignment).not.toHaveBeenCalled();
    });

    it('DELETE com versão antiga responde 409', async () => {
      app = buildTestApp({
        removeAssignment: async () => {
          throw new StaleVersionError();
        },
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/assignments/${A1}?version=1`,
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe('vínculo professor ↔ atribuições', () => {
    it('remover habilitação em uso responde 409', async () => {
      app = buildTestApp({
        updateTeacher: vi.fn<UpdateTeacher['execute']>(async () => {
          throw new QualificationInUseError();
        }),
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/teachers/${ANA}`,
        payload: { name: 'Ana', subjectIds: [], version: 1 },
      });

      expect(response.statusCode).toBe(409);
      expect(apiErrorSchema.parse(response.json()).error.code).toBe('teacher.qualification_in_use');
    });

    it('arquivar professor com aulas responde 409', async () => {
      app = buildTestApp({
        archiveTeacher: vi.fn<ArchiveTeacher['execute']>(async () => {
          throw new TeacherHasAssignmentsError();
        }),
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/teachers/${ANA}/archive`,
        payload: { version: 1 },
      });

      expect(response.statusCode).toBe(409);
      expect(apiErrorSchema.parse(response.json()).error.code).toBe('teacher.has_assignments');
    });
  });
});
