import type { Clock } from '../../../shared/ports.ts';
import { bindUseCase } from '../../../shared/use-case.ts';
import { UpdateSubject, ArchiveSubject, RestoreSubject } from './usecases/change-subject.ts';
import type { SubjectRepository } from './ports/subject-repository.ts';
export { UpdateSubject, ArchiveSubject, RestoreSubject };
export function makeUpdateSubject(deps: { subjects: SubjectRepository }) {
  return bindUseCase(new UpdateSubject(deps));
}
export function makeArchiveSubject(deps: { subjects: SubjectRepository; clock: Clock }) {
  return bindUseCase(new ArchiveSubject(deps));
}
export function makeRestoreSubject(deps: { subjects: SubjectRepository }) {
  return bindUseCase(new RestoreSubject(deps));
}
