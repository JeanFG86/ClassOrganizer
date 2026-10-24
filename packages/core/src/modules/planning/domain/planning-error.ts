import { DomainError } from '../../../shared/domain-error.ts';

export class PlanningError extends DomainError {
  readonly code: string;
  readonly kind: 'validation' | 'conflict';
  constructor(code: string, message: string, kind: PlanningError['kind'] = 'conflict') {
    super(message);
    this.code = code;
    this.kind = kind;
  }
}
