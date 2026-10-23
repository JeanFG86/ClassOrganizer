import type { Subject } from '../domain/subject.ts';
import type { SubjectRepository } from './subject-repository.ts';

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

export function makeListSubjects({ subjects }: { subjects: SubjectRepository }) {
  return async function listSubjects(): Promise<Subject[]> {
    const all = await subjects.listAll();
    return all.toSorted((a, b) => collator.compare(a.name, b.name));
  };
}

export type ListSubjects = ReturnType<typeof makeListSubjects>;
