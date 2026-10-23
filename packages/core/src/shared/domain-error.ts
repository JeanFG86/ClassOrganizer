/**
 * Categoria do erro, usada pelos adaptadores de entrada para escolher a resposta
 * (por exemplo, o status HTTP) sem conhecer cada erro individualmente.
 */
export type DomainErrorKind = 'validation' | 'conflict' | 'not_found';

/** Erro de regra de negócio, com código estável e mensagem para a secretaria. */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly kind: DomainErrorKind;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
