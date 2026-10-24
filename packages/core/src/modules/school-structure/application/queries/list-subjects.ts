import { compareNames } from '../../../../shared/names.ts';
import type { Subject } from '../../domain/subject.ts';
import type { SubjectRepository } from '../ports/subject-repository.ts';

export class ListSubjects {
  readonly #subjects: SubjectRepository;
  constructor(deps: { subjects: SubjectRepository }) {
    this.#subjects = deps.subjects;
  }

  async execute(): Promise<Subject[]> {
    return (await this.#subjects.listAll()).toSorted((a, b) => compareNames(a.name, b.name));
  }
}
