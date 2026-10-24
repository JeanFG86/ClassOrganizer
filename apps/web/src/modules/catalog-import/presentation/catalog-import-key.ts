import type { InjectionKey } from 'vue';
import type { CatalogImportApi } from '../application/catalog-import-api.ts';

export const catalogImportApiKey: InjectionKey<CatalogImportApi> = Symbol('catalogImportApi');
