import { compareNames } from '../../../../shared/names.ts';
import type { Teacher } from '../../domain/teacher.ts';
import type { TeacherRepository } from '../ports/index.ts';

export type ListTeachersDependencies = { teachers: TeacherRepository };
export class ListTeachers {
  readonly #deps: ListTeachersDependencies;
  constructor(deps: ListTeachersDependencies) {
    this.#deps = deps;
  }
  async execute(): Promise<Teacher[]> {
    const { teachers } = this.#deps;

    const all = await teachers.listAll();

    return all.toSorted((a, b) => compareNames(a.name, b.name));
  }
}
