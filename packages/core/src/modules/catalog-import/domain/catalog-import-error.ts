import { DomainError } from '../../../shared/domain-error.ts';

/** A confirmação recebeu um arquivo com erros: nada é gravado. */
export class CatalogImportInvalidError extends DomainError {
  readonly code = 'catalog_import.invalid';
  readonly kind = 'validation';

  constructor() {
    super('O arquivo tem erros e nada foi gravado. Corrija as linhas indicadas na prévia.');
  }
}

/** Todas as linhas já estavam cadastradas. */
export class CatalogImportEmptyError extends DomainError {
  readonly code = 'catalog_import.nothing_to_import';
  readonly kind = 'validation';

  constructor() {
    super('Todas as linhas já estão cadastradas; não há nada novo para importar.');
  }
}

/** O resultado de alguma linha mudou entre a prévia e a confirmação (controle otimista). */
export class CatalogImportStaleError extends DomainError {
  readonly code = 'concurrency.stale';
  readonly kind = 'conflict';

  constructor() {
    super(
      'Os cadastros foram alterados e o resultado de alguma linha mudou depois da prévia. ' +
        'Gere a prévia novamente e confira antes de importar.',
    );
  }
}
