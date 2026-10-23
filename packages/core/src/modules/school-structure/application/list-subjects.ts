import { compareNames } from '../../../shared/names.ts';
import type { Subject } from '../domain/subject.ts';
import type { SubjectRepository } from './subject-repository.ts';

export function makeListSubjects({ subjects }: { subjects: SubjectRepository }) {
  return async function listSubjects(): Promise<Subject[]> {
    const all = await subjects.listAll();
    return all.toSorted((a, b) => compareNames(a.name, b.name));
  };
}

export type ListSubjects = ReturnType<typeof makeListSubjects>;
