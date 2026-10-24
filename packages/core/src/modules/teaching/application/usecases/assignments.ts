import { TeachingAssignmentEntity } from '../../domain/assignment.ts';

import type { Clock, IdGenerator } from '../../../../shared/ports.ts';
import { assertVersion } from '../../../../shared/versioning.ts';
import type { VersionedRef } from '../../../../shared/versioning.ts';
import {
  AssignmentNotFoundError,
  InvalidAssignmentReferenceError,
  TeacherNotQualifiedError,
} from '../../domain/assignment.ts';
import type { AssignmentParticipant, TeachingAssignment } from '../../domain/assignment.ts';
import type {
  AssignmentRepository,
  ClassGroupStatusLookup,
  ResourceLookup,
  SubjectLookup,
  TeacherRepository,
} from '../ports/index.ts';

interface AssignmentDeps {
  assignments: AssignmentRepository;
  teachers: TeacherRepository;
  subjects: SubjectLookup;
  classGroups: ClassGroupStatusLookup;
  resources: ResourceLookup;
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

/** Recursos novos no bloco precisam existir e estar ativos; os mantidos podem estar arquivados. */
async function assertResources(resources: ResourceLookup, ids: readonly string[]): Promise<void> {
  if (!ids.length) return;
  const statuses = await resources.resourceStatuses(ids);
  for (const id of ids) {
    const status = statuses.get(id);
    if (status === undefined) {
      throw new InvalidAssignmentReferenceError('O recurso selecionado não existe mais.');
    }
    if (status === 'archived') {
      throw new InvalidAssignmentReferenceError('O recurso selecionado está arquivado.');
    }
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

export type AssignTeachingDependencies = AssignmentDeps & { clock: Clock; ids: IdGenerator };
export class AssignTeaching {
  readonly #deps: AssignTeachingDependencies;
  constructor(deps: AssignTeachingDependencies) {
    this.#deps = deps;
  }
  async execute(input: {
    classGroupId: string;
    participants: readonly AssignmentParticipant[];
    weeklyLessons: number;
    /** Ausente: o bloco não usa recurso especial. */
    resourceIds?: readonly string[] | undefined;
  }): Promise<TeachingAssignment> {
    const deps = this.#deps;

    const assignment = TeachingAssignmentEntity.create({
      id: deps.ids.next(),
      ...input,
      resourceIds: input.resourceIds ?? [],
      createdAt: deps.clock.now(),
    }).snapshot();

    const classGroup = await deps.classGroups.classGroupStatus(assignment.classGroupId);

    if (classGroup === undefined) {
      throw new InvalidAssignmentReferenceError('A turma selecionada não existe mais.');
    }

    if (classGroup === 'archived') {
      throw new InvalidAssignmentReferenceError('A turma selecionada está arquivada.');
    }

    await assertParticipants(deps, assignment.participants);

    await assertResources(deps.resources, assignment.resourceIds);

    await deps.assignments.add(assignment);

    return assignment;
  }
}

export type ListAssignmentsDependencies = { assignments: AssignmentRepository };
export class ListAssignments {
  readonly #deps: ListAssignmentsDependencies;
  constructor(deps: ListAssignmentsDependencies) {
    this.#deps = deps;
  }
  execute(): Promise<TeachingAssignment[]> {
    const { assignments } = this.#deps;

    return assignments.listAll();
  }
}

export type ChangeAssignmentDependencies = {
  assignments: AssignmentRepository;
  teachers: TeacherRepository;
  subjects: SubjectLookup;
  resources: ResourceLookup;
};
export class ChangeAssignment {
  readonly #deps: ChangeAssignmentDependencies;
  constructor(deps: ChangeAssignmentDependencies) {
    this.#deps = deps;
  }
  async execute(
    input: VersionedRef & {
      participants: readonly AssignmentParticipant[];
      weeklyLessons: number;
      /** Ausente: mantém os recursos atuais do bloco. */
      resourceIds?: readonly string[] | undefined;
    },
  ): Promise<TeachingAssignment> {
    const deps = this.#deps;

    const current = await loadForChange(deps.assignments, input);

    const changed = TeachingAssignmentEntity.reconstitute(current)
      .change({
        ...input,
        resourceIds: input.resourceIds ?? current.resourceIds,
      })
      .snapshot();

    // Participações mantidas podem referenciar disciplina arquivada, como antes.
    const added = changed.participants.filter(
      (p) =>
        !current.participants.some(
          (old) => old.teacherId === p.teacherId && old.subjectId === p.subjectId,
        ),
    );

    await assertParticipants(deps, added);

    await assertResources(
      deps.resources,
      changed.resourceIds.filter((id) => !current.resourceIds.includes(id)),
    );

    return deps.assignments.update(changed);
  }
}

export type RemoveAssignmentDependencies = { assignments: AssignmentRepository };
export class RemoveAssignment {
  readonly #deps: RemoveAssignmentDependencies;
  constructor(deps: RemoveAssignmentDependencies) {
    this.#deps = deps;
  }
  async execute(ref: VersionedRef): Promise<void> {
    const { assignments } = this.#deps;

    const current = await loadForChange(assignments, ref);

    await assignments.remove(current);
  }
}
