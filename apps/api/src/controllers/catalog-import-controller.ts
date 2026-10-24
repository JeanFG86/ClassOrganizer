import type { CatalogImportPreviewDto, CatalogImportResultDto } from '@classorganizer/contracts';
import type {
  CatalogImportPreview,
  GetCatalogImportTemplate,
  ImportCatalog,
  PreviewCatalogImport,
} from '@classorganizer/core';

export interface CatalogImportOperations {
  catalogImportTemplate(
    ...args: Parameters<GetCatalogImportTemplate['execute']>
  ): Promise<ReturnType<GetCatalogImportTemplate['execute']>>;
  previewCatalogImport: PreviewCatalogImport['execute'];
  importCatalog: ImportCatalog['execute'];
}

function toDto(preview: CatalogImportPreview): CatalogImportPreviewDto {
  return {
    kind: preview.kind,
    digest: preview.digest,
    columns: [...preview.columns],
    fileErrors: [...preview.fileErrors],
    summary: { ...preview.summary },
    rows: preview.rows.map((row) => ({
      line: row.line,
      cells: [...row.cells],
      status: row.status,
      messages: row.messages.map((message) => ({ ...message })),
    })),
  };
}

/** Recebe somente operações já autorizadas; não cria serviços nem acessa persistência. */
export class CatalogImportController {
  readonly #operations: CatalogImportOperations;
  constructor(operations: CatalogImportOperations) {
    this.#operations = operations;
  }

  template(...args: Parameters<CatalogImportOperations['catalogImportTemplate']>) {
    return this.#operations.catalogImportTemplate(...args);
  }
  async preview(
    input: Parameters<PreviewCatalogImport['execute']>[0],
  ): Promise<CatalogImportPreviewDto> {
    return toDto(await this.#operations.previewCatalogImport(input));
  }
  async import(input: Parameters<ImportCatalog['execute']>[0]): Promise<CatalogImportResultDto> {
    return { ...(await this.#operations.importCatalog(input)) };
  }
}
