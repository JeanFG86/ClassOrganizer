import { beforeEach, describe, expect, it } from 'vitest';
import type { EntityStatus } from '../../../shared/archiving.ts';
import { StaleVersionError } from '../../../shared/versioning.ts';
import { InMemoryAssignmentRepository } from '../../../testing/in-memory-repositories.ts';
import {
  AssignmentNotFoundError,
  InvalidAssignmentParticipantsError,
  InvalidAssignmentReferenceError,
  InvalidWeeklyLessonsError,
  TeacherNotQualifiedError,
  createAssignment,
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
const first = { teacherId: 'teacher-a', subjectId: 'math' };
const second = { teacherId: 'teacher-b', subjectId: 'math' };
const parallel = { teacherId: 'teacher-c', subjectId: 'history' };
const valid = { classGroupId: '6A', participants: [first], weeklyLessons: 5 };

function teacher(id: string, subjectIds: string[], archived = false): Teacher {
  return {
    ...createTeacher({ id, name: id, subjectIds, createdAt: now }),
    archivedAt: archived ? now : null,
  };
}

describe('atribuições em blocos de aulas', () => {
  let assignments: InMemoryAssignmentRepository;
  let teachersById: Map<string, Teacher>;
  let subjectStatus: Map<string, EntityStatus>;
  let assign: ReturnType<typeof makeAssignTeaching>;
  let change: ReturnType<typeof makeChangeAssignment>;
  let remove: ReturnType<typeof makeRemoveAssignment>;
  beforeEach(() => {
    assignments = new InMemoryAssignmentRepository();
    teachersById = new Map([
      ['teacher-a', teacher('teacher-a', ['math', 'physics'])],
      ['teacher-b', teacher('teacher-b', ['math'])],
      ['teacher-c', teacher('teacher-c', ['history'])],
      ['archived', teacher('archived', ['math'], true)],
    ]);
    subjectStatus = new Map([
      ['math', 'active'],
      ['physics', 'active'],
      ['history', 'active'],
      ['latin', 'archived'],
    ]);
    const classGroups = new Map<string, EntityStatus>([
      ['6A', 'active'],
      ['6B', 'active'],
      ['5A', 'archived'],
    ]);
    const teachers = {
      findById: async (id: string) => teachersById.get(id) ?? null,
    } as TeacherRepository;
    const deps = {
      assignments,
      teachers,
      subjects: {
        subjectStatuses: async (ids: readonly string[]) =>
          new Map([...subjectStatus].filter(([id]) => ids.includes(id))),
      },
      classGroups: { classGroupStatus: async (id: string) => classGroups.get(id) },
    };
    let sequence = 0;
    assign = makeAssignTeaching({
      ...deps,
      clock: { now: () => now },
      ids: { next: () => 'a-' + ++sequence },
    });
    change = makeChangeAssignment(deps);
    remove = makeRemoveAssignment(deps);
  });

  it('atribui um professor e lista o bloco', async () => {
    const assignment = await assign(valid);
    expect(assignment).toEqual({ id: 'a-1', ...valid, createdAt: now, version: 1 });
    expect(await makeListAssignments({ assignments })()).toEqual([assignment]);
  });
  it('aceita acompanhamento, divisão em blocos e disciplinas simultâneas', async () => {
    const shared = await assign({
      ...valid,
      participants: [first, second, parallel],
      weeklyLessons: 2,
    });
    const separate = await assign({ ...valid, participants: [second], weeklyLessons: 3 });
    expect(shared.participants).toEqual([first, second, parallel]);
    expect(separate.id).not.toBe(shared.id);
    expect(await assignments.subjectIdsAssignedTo(second.teacherId)).toEqual(new Set(['math']));
    expect(await assignments.subjectIdsAssignedTo(parallel.teacherId)).toEqual(
      new Set(['history']),
    );
  });
  it.each([0, -1, 2.5, 41, Number.NaN])('rejeita carga inválida (%s)', async (n) => {
    await expect(assign({ ...valid, weeklyLessons: n })).rejects.toThrow(InvalidWeeklyLessonsError);
  });
  it.each([1, 40])('aceita carga no limite %s', async (weeklyLessons) => {
    await expect(assign({ ...valid, weeklyLessons })).resolves.toBeDefined();
  });
  it.each(
    [[], [first, first], [first, { ...first, subjectId: 'physics' }]].map((participants) => ({
      participants,
    })),
  )('recusa bloco vazio ou professor repetido ($participants)', async ({ participants }) => {
    await expect(assign({ ...valid, participants })).rejects.toThrow(
      InvalidAssignmentParticipantsError,
    );
    expect(assignments.store.items.size).toBe(0);
  });
  it('valida a habilitação de todos, inclusive o segundo participante', async () => {
    await expect(
      assign({ ...valid, participants: [first, { ...parallel, subjectId: 'math' }] }),
    ).rejects.toThrow(TeacherNotQualifiedError);
  });
  it.each([
    ['teacher-a', 'missing', 'A disciplina selecionada não existe mais.'],
    ['teacher-a', 'latin', 'A disciplina selecionada está arquivada.'],
    ['missing', 'math', 'O professor selecionado não existe mais.'],
    ['archived', 'math', 'O professor selecionado está arquivado.'],
  ])('recusa referência inválida %s/%s', async (teacherId, subjectId, message) => {
    const single = assign({ ...valid, participants: [{ teacherId, subjectId }] });
    await expect(single).rejects.toThrow(message);
    expect(assignments.store.items.size).toBe(0);
  });
  it.each(['missing', '5A'])('recusa turma ausente ou arquivada (%s)', async (classGroupId) => {
    await expect(assign({ ...valid, classGroupId })).rejects.toThrow(
      InvalidAssignmentReferenceError,
    );
  });
  it('edita participantes e carga com versão e mantém a turma', async () => {
    const assignment = await assign(valid);
    const changed = await change({
      id: assignment.id,
      version: 1,
      participants: [second, parallel],
      weeklyLessons: 4,
    });
    expect(changed).toMatchObject({
      classGroupId: '6A',
      participants: [second, parallel],
      weeklyLessons: 4,
      version: 2,
    });
    await expect(
      change({ id: assignment.id, version: 1, participants: [first], weeklyLessons: 3 }),
    ).rejects.toThrow(StaleVersionError);
  });
  it('valida novas disciplinas e professores na edição sem alterar o bloco ao falhar', async () => {
    const assignment = await assign(valid);
    await expect(
      change({
        id: assignment.id,
        version: 1,
        participants: [first, { ...parallel, subjectId: 'math' }],
        weeklyLessons: 5,
      }),
    ).rejects.toThrow(TeacherNotQualifiedError);
    await expect(
      change({ id: assignment.id, version: 1, participants: [], weeklyLessons: 5 }),
    ).rejects.toThrow(InvalidAssignmentParticipantsError);
    await expect(
      change({
        id: assignment.id,
        version: 1,
        participants: [{ ...first, subjectId: 'latin' }],
        weeklyLessons: 5,
      }),
    ).rejects.toThrow(InvalidAssignmentReferenceError);
    expect(await assignments.findById(assignment.id)).toEqual(assignment);
  });
  it('permite manter participante de disciplina arquivada ao editar a carga', async () => {
    const assignment = await assign(valid);
    subjectStatus.set('math', 'archived');
    await expect(
      change({ id: assignment.id, version: 1, participants: [first], weeklyLessons: 4 }),
    ).resolves.toMatchObject({ weeklyLessons: 4 });
  });
  it('não retém referências mutáveis da entrada', () => {
    const participants = [{ ...first }];
    const assignment = createAssignment({ ...valid, id: 'a1', participants, createdAt: now });
    if (participants[0]) participants[0].teacherId = 'changed';
    participants.push(second);
    expect(assignment.participants).toEqual([first]);
  });
  it('remove somente com versão atual', async () => {
    const assignment = await assign(valid);
    await expect(remove({ id: assignment.id, version: 2 })).rejects.toThrow(StaleVersionError);
    await remove({ id: assignment.id, version: 1 });
    expect(assignments.store.items.size).toBe(0);
    await expect(remove({ id: assignment.id, version: 1 })).rejects.toThrow(
      AssignmentNotFoundError,
    );
  });
});
