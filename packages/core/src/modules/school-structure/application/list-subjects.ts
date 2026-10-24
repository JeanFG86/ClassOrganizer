import { bindUseCase } from '../../../shared/use-case.ts';
import { ListSubjects } from './queries/list-subjects.ts';
import type { SubjectRepository } from './ports/subject-repository.ts';
export { ListSubjects };
export function makeListSubjects(deps: { subjects: SubjectRepository }) {
  return bindUseCase(new ListSubjects(deps));
}
