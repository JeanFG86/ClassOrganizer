/**
 * Categoria do erro, usada pelos adaptadores de entrada para escolher a resposta
 * (por exemplo, o status HTTP) sem conhecer cada erro individualmente.
 */
export type DomainErrorKind =
  'validation' | 'conflict' | 'not_found' | 'unauthorized' | 'forbidden' | 'rate_limit';

/** Erro de regra de negócio, com código estável e mensagem para a secretaria. */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly kind: DomainErrorKind;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  readonly code: string;
  readonly kind = 'not_found';

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
