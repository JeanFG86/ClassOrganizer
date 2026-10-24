import type { Clock, IdGenerator } from '../../../../shared/ports.ts';
import { SubjectEntity, SubjectNameAlreadyInUseError, type Subject } from '../../domain/subject.ts';
import type { SubjectRepository } from '../ports/subject-repository.ts';

export interface RegisterSubjectDeps {
  subjects: SubjectRepository;
  clock: Clock;
  ids: IdGenerator;
}

export class RegisterSubject {
  readonly #deps: RegisterSubjectDeps;

  constructor(deps: RegisterSubjectDeps) {
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
