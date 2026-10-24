import type {
  CatalogImportKind,
  CatalogImportPreviewDto,
  CatalogImportPreviewRequest,
  CatalogImportRequest,
  CatalogImportResultDto,
} from '@classorganizer/contracts';

export interface CatalogImportApi {
  template(kind: CatalogImportKind): Promise<Blob>;
  preview(input: CatalogImportPreviewRequest): Promise<CatalogImportPreviewDto>;
  import(input: CatalogImportRequest): Promise<CatalogImportResultDto>;
}
