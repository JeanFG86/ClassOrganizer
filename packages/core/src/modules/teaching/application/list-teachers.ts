import { compareNames } from '../../../shared/names.ts';
import type { Teacher } from '../domain/teacher.ts';
import type { TeacherRepository } from './ports.ts';

export function makeListTeachers({ teachers }: { teachers: TeacherRepository }) {
  return async function listTeachers(): Promise<Teacher[]> {
    const all = await teachers.listAll();
    return all.toSorted((a, b) => compareNames(a.name, b.name));
  };
}

export type ListTeachers = ReturnType<typeof makeListTeachers>;
