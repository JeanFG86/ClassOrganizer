import { compareNames } from '../../../../shared/names.ts';
import type { Clock, IdGenerator } from '../../../../shared/ports.ts';
import { assertVersion, type VersionedRef } from '../../../../shared/versioning.ts';
import {
  SubjectEntity,
  SubjectNameAlreadyInUseError,
  SubjectNotFoundError,
  type Subject,
} from '../../domain/subject.ts';
import type { SubjectRepository } from '../ports/subject-repository.ts';

async function loadForChange(
  subjects: SubjectRepository,
  ref: VersionedRef,
): Promise<SubjectEntity> {
  const state = await subjects.findById(ref.id);
  if (!state) throw new SubjectNotFoundError();
  assertVersion(state.version, ref.version);
  return SubjectEntity.reconstitute(state);
}

export type RegisterSubjectDependencies = {
  subjects: SubjectRepository;
  clock: Clock;
  ids: IdGenerator;
};
export class RegisterSubject {
  readonly #deps: RegisterSubjectDependencies;
  constructor(deps: RegisterSubjectDependencies) {
    this.#deps = deps;
  }
  async execute(input: { name: string }): Promise<Subject> {
    const { subjects, clock, ids } = this.#deps;
    const subject = SubjectEntity.create({
      id: ids.next(),
      name: input.name,
      createdAt: clock.now(),
    }).snapshot();
    const existing = await subjects.findByNormalizedName(subject.normalizedName);
    if (existing) throw new SubjectNameAlreadyInUseError(existing);
    await subjects.add(subject);
    return subject;
  }
}

export type ListSubjectsDependencies = { subjects: SubjectRepository };
export class ListSubjects {
  readonly #deps: ListSubjectsDependencies;
  constructor(deps: ListSubjectsDependencies) {
    this.#deps = deps;
  }
  async execute(): Promise<Subject[]> {
    const all = await this.#deps.subjects.listAll();
    return all.toSorted((a, b) => compareNames(a.name, b.name));
  }
}

export type UpdateSubjectDependencies = { subjects: SubjectRepository };
export class UpdateSubject {
  readonly #deps: UpdateSubjectDependencies;
  constructor(deps: UpdateSubjectDependencies) {
    this.#deps = deps;
  }
  async execute(input: VersionedRef & { name: string }): Promise<Subject> {
    const { subjects } = this.#deps;
    const entity = await loadForChange(subjects, input);
    const renamed = entity.rename(input.name).snapshot();
    const existing = await subjects.findByNormalizedName(renamed.normalizedName);
    if (existing && existing.id !== renamed.id) throw new SubjectNameAlreadyInUseError(existing);
    return subjects.update(renamed);
  }
}

export type ArchiveSubjectDependencies = { subjects: SubjectRepository; clock: Clock };
export class ArchiveSubject {
  readonly #deps: ArchiveSubjectDependencies;
  constructor(deps: ArchiveSubjectDependencies) {
    this.#deps = deps;
  }
  async execute(ref: VersionedRef): Promise<Subject> {
    const { subjects, clock } = this.#deps;
    const entity = await loadForChange(subjects, ref);
    const current = entity.snapshot();
    return current.archivedAt ? current : subjects.update(entity.archive(clock.now()).snapshot());
  }
}

export type RestoreSubjectDependencies = { subjects: SubjectRepository };
export class RestoreSubject {
  readonly #deps: RestoreSubjectDependencies;
  constructor(deps: RestoreSubjectDependencies) {
    this.#deps = deps;
  }
  async execute(ref: VersionedRef): Promise<Subject> {
    const { subjects } = this.#deps;
    const entity = await loadForChange(subjects, ref);
    const current = entity.snapshot();
    return current.archivedAt ? subjects.update(entity.restore().snapshot()) : current;
  }
}
