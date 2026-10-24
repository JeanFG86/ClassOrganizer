import {
  CSV_MEDIA_TYPE,
  catalogImportPreviewSchema,
  catalogImportResultSchema,
} from '@classorganizer/contracts';
import type {
  FileDownloadClient,
  HttpClient,
} from '../../../shared/application/ports/http-client.ts';
import type { CatalogImportApi } from '../application/catalog-import-api.ts';

export function createCatalogImportApi(client: HttpClient & FileDownloadClient): CatalogImportApi {
  return {
    template: (kind) =>
      client.download(`/catalog-imports/${encodeURIComponent(kind)}/template`, CSV_MEDIA_TYPE),
    preview: (input) =>
      client.request(catalogImportPreviewSchema, '/catalog-imports/preview', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    import: (input) =>
      client.request(catalogImportResultSchema, '/catalog-imports', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  };
}
