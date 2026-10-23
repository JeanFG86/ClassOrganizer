import type { Clock } from '../../../shared/ports.ts';
import { assertVersion } from '../../../shared/versioning.ts';
import type { VersionedRef } from '../../../shared/versioning.ts';
import {
  SubjectNameAlreadyInUseError,
  SubjectNotFoundError,
  archiveSubject,
  renameSubject,
  restoreSubject,
} from '../domain/subject.ts';
import type { Subject } from '../domain/subject.ts';
import type { SubjectRepository } from './subject-repository.ts';

async function loadForChange(subjects: SubjectRepository, ref: VersionedRef): Promise<Subject> {
  const subject = await subjects.findById(ref.id);
  if (!subject) {
    throw new SubjectNotFoundError();
  }
  assertVersion(subject.version, ref.version);
  return subject;
}

export function makeUpdateSubject({ subjects }: { subjects: SubjectRepository }) {
  return async function updateSubject(input: VersionedRef & { name: string }): Promise<Subject> {
    const current = await loadForChange(subjects, input);
    const renamed = renameSubject(current, input.name);

    const sameName = await subjects.findByNormalizedName(renamed.normalizedName);
    if (sameName && sameName.id !== renamed.id) {
      throw new SubjectNameAlreadyInUseError(sameName);
    }

    return subjects.update(renamed);
  };
}

export function makeArchiveSubject({
  subjects,
  clock,
}: {
  subjects: SubjectRepository;
  clock: Clock;
}) {
  return async function archive(ref: VersionedRef): Promise<Subject> {
    const current = await loadForChange(subjects, ref);
    if (current.archivedAt) {
      return current;
    }
    return subjects.update(archiveSubject(current, clock.now()));
  };
}

export function makeRestoreSubject({ subjects }: { subjects: SubjectRepository }) {
  return async function restore(ref: VersionedRef): Promise<Subject> {
    const current = await loadForChange(subjects, ref);
    if (!current.archivedAt) {
      return current;
    }
    return subjects.update(restoreSubject(current));
  };
}

export type UpdateSubject = ReturnType<typeof makeUpdateSubject>;
export type ArchiveSubject = ReturnType<typeof makeArchiveSubject>;
export type RestoreSubject = ReturnType<typeof makeRestoreSubject>;
