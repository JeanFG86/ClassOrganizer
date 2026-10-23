import type { Clock, IdGenerator } from '../../../shared/ports.ts';
import { SubjectNameAlreadyInUseError, createSubject } from '../domain/subject.ts';
import type { Subject } from '../domain/subject.ts';
import type { SubjectRepository } from './subject-repository.ts';

export interface RegisterSubjectDeps {
  subjects: SubjectRepository;
  clock: Clock;
  ids: IdGenerator;
}

export function makeRegisterSubject({ subjects, clock, ids }: RegisterSubjectDeps) {
  return async function registerSubject(input: { name: string }): Promise<Subject> {
    const subject = createSubject({ id: ids.next(), name: input.name, createdAt: clock.now() });

    if (await subjects.existsWithNormalizedName(subject.normalizedName)) {
      throw new SubjectNameAlreadyInUseError(subject.name);
    }

    await subjects.add(subject);
    return subject;
  };
}

export type RegisterSubject = ReturnType<typeof makeRegisterSubject>;
