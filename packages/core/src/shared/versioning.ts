import { DomainError } from './domain-error.ts';

/** Identifica o cadastro e a versão que o usuário estava vendo ao pedir a alteração. */
export interface VersionedRef {
  id: string;
  version: number;
}

/** A alteração partiu de uma versão que já não é a atual (controle otimista). */
export class StaleVersionError extends DomainError {
  readonly code = 'concurrency.stale';
  readonly kind = 'conflict';

  constructor() {
    super(
      'Este cadastro foi alterado em outra tela ou por outra pessoa. ' +
        'A lista foi atualizada; confira e tente novamente.',
    );
  }
}

/** Confere se a versão que o usuário viu ainda é a versão atual do cadastro. */
export function assertVersion(current: number, expected: number): void {
  if (current !== expected) {
    throw new StaleVersionError();
  }
}
