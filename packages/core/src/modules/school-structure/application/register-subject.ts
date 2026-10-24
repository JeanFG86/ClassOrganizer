import { bindUseCase } from '../../../shared/use-case.ts';
import { RegisterSubject, type RegisterSubjectDeps } from './usecases/register-subject.ts';
export { RegisterSubject, type RegisterSubjectDeps };
export function makeRegisterSubject(deps: RegisterSubjectDeps) {
  return bindUseCase(new RegisterSubject(deps));
}
