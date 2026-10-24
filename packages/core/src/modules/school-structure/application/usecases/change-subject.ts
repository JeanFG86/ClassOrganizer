import type { Clock } from '../../../../shared/ports.ts';
import { assertVersion, type VersionedRef } from '../../../../shared/versioning.ts';
import {
  SubjectEntity,
  SubjectNameAlreadyInUseError,
  SubjectNotFoundError,
  type Subject,
} from '../../domain/subject.ts';
import type { SubjectRepository } from '../ports/subject-repository.ts';

async function load(subjects: SubjectRepository, ref: VersionedRef): Promise<SubjectEntity> {
  const state = await subjects.findById(ref.id);
  if (!state) throw new SubjectNotFoundError();
  assertVersion(state.version, ref.version);
  return SubjectEntity.reconstitute(state);
}

export class UpdateSubject {
  readonly #subjects: SubjectRepository;
  constructor(deps: { subjects: SubjectRepository }) {
    this.#subjects = deps.subjects;
  }

  async execute(input: VersionedRef & { name: string }): Promise<Subject> {
    const entity = await load(this.#subjects, input);
    const renamed = entity.rename(input.name).snapshot();
    const existing = await this.#subjects.findByNormalizedName(renamed.normalizedName);
    if (existing && existing.id !== renamed.id) throw new SubjectNameAlreadyInUseError(existing);
    return this.#subjects.update(renamed);
  }
}

export class ArchiveSubject {
  readonly #deps: { subjects: SubjectRepository; clock: Clock };
  constructor(deps: { subjects: SubjectRepository; clock: Clock }) {
    this.#deps = deps;
  }

  async execute(ref: VersionedRef): Promise<Subject> {
    const entity = await load(this.#deps.subjects, ref);
    const current = entity.snapshot();
    return current.archivedAt
      ? current
      : this.#deps.subjects.update(entity.archive(this.#deps.clock.now()).snapshot());
  }
}

export class RestoreSubject {
  readonly #subjects: SubjectRepository;
  constructor(deps: { subjects: SubjectRepository }) {
    this.#subjects = deps.subjects;
  }

  async execute(ref: VersionedRef): Promise<Subject> {
    const entity = await load(this.#subjects, ref);
    const current = entity.snapshot();
    return current.archivedAt ? this.#subjects.update(entity.restore().snapshot()) : current;
  }
}
