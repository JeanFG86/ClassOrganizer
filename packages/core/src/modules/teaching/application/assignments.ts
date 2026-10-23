import type { Clock, IdGenerator } from '../../../shared/ports.ts';
import { assertVersion } from '../../../shared/versioning.ts';
import type { VersionedRef } from '../../../shared/versioning.ts';
import {
  AssignmentNotFoundError,
  InvalidAssignmentReferenceError,
  TeacherNotQualifiedError,
  changeAssignment,
  createAssignment,
} from '../domain/assignment.ts';
import type { AssignmentParticipant, TeachingAssignment } from '../domain/assignment.ts';
import type {
  AssignmentRepository,
  ClassGroupStatusLookup,
  SubjectLookup,
  TeacherRepository,
} from './ports.ts';

interface AssignmentDeps {
  assignments: AssignmentRepository;
  teachers: TeacherRepository;
  subjects: SubjectLookup;
  classGroups: ClassGroupStatusLookup;
}

/** O professor precisa existir, estar ativo e ser habilitado na disciplina. */
async function assertTeacherCanTeach(
  teachers: TeacherRepository,
  teacherId: string,
  subjectId: string,
): Promise<void> {
  const teacher = await teachers.findById(teacherId);
  if (!teacher) {
    throw new InvalidAssignmentReferenceError('O professor selecionado não existe mais.');
  }
  if (teacher.archivedAt) {
    throw new InvalidAssignmentReferenceError('O professor selecionado está arquivado.');
  }
  if (!teacher.subjectIds.includes(subjectId)) {
    throw new TeacherNotQualifiedError();
  }
}

async function assertParticipants(
  deps: Pick<AssignmentDeps, 'teachers' | 'subjects'>,
  participants: readonly AssignmentParticipant[],
): Promise<void> {
  const statuses = await deps.subjects.subjectStatuses([
    ...new Set(participants.map((p) => p.subjectId)),
  ]);
  for (const participant of participants) {
    const subject = statuses.get(participant.subjectId);
    if (subject === undefined) {
      throw new InvalidAssignmentReferenceError('A disciplina selecionada não existe mais.');
    }
    if (subject === 'archived') {
      throw new InvalidAssignmentReferenceError('A disciplina selecionada está arquivada.');
    }
    await assertTeacherCanTeach(deps.teachers, participant.teacherId, participant.subjectId);
  }
}

async function loadForChange(
  assignments: AssignmentRepository,
  ref: VersionedRef,
): Promise<TeachingAssignment> {
  const assignment = await assignments.findById(ref.id);
  if (!assignment) {
    throw new AssignmentNotFoundError();
  }
  assertVersion(assignment.version, ref.version);
  return assignment;
}

export function makeAssignTeaching(deps: AssignmentDeps & { clock: Clock; ids: IdGenerator }) {
  return async function assignTeaching(input: {
    classGroupId: string;
    participants: readonly AssignmentParticipant[];
    weeklyLessons: number;
  }): Promise<TeachingAssignment> {
    const assignment = createAssignment({
      id: deps.ids.next(),
      ...input,
      createdAt: deps.clock.now(),
    });

    const classGroup = await deps.classGroups.classGroupStatus(assignment.classGroupId);
    if (classGroup === undefined) {
      throw new InvalidAssignmentReferenceError('A turma selecionada não existe mais.');
    }
    if (classGroup === 'archived') {
      throw new InvalidAssignmentReferenceError('A turma selecionada está arquivada.');
    }

    await assertParticipants(deps, assignment.participants);

    await deps.assignments.add(assignment);
    return assignment;
  };
}

export function makeListAssignments({ assignments }: { assignments: AssignmentRepository }) {
  return function listAssignments(): Promise<TeachingAssignment[]> {
    return assignments.listAll();
  };
}

export function makeChangeAssignment(deps: {
  assignments: AssignmentRepository;
  teachers: TeacherRepository;
  subjects: SubjectLookup;
}) {
  return async function changeAssignmentUseCase(
    input: VersionedRef & { participants: readonly AssignmentParticipant[]; weeklyLessons: number },
  ): Promise<TeachingAssignment> {
    const current = await loadForChange(deps.assignments, input);
    const changed = changeAssignment(current, input);

    // Participações mantidas podem referenciar disciplina arquivada, como antes.
    const added = changed.participants.filter(
      (p) =>
        !current.participants.some(
          (old) => old.teacherId === p.teacherId && old.subjectId === p.subjectId,
        ),
    );
    await assertParticipants(deps, added);

    return deps.assignments.update(changed);
  };
}

export function makeRemoveAssignment({ assignments }: { assignments: AssignmentRepository }) {
  return async function removeAssignment(ref: VersionedRef): Promise<void> {
    const current = await loadForChange(assignments, ref);
    await assignments.remove(current);
  };
}

export type AssignTeaching = ReturnType<typeof makeAssignTeaching>;
export type ListAssignments = ReturnType<typeof makeListAssignments>;
export type ChangeAssignment = ReturnType<typeof makeChangeAssignment>;
export type RemoveAssignment = ReturnType<typeof makeRemoveAssignment>;
