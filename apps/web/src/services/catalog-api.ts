import type { z } from 'zod';
import { apiRequest } from './api-client.ts';

/** Cadastro simples identificado por nome, com edição, arquivamento e versão. */
export interface CatalogItem {
  id: string;
  name: string;
  archivedAt: string | null;
  version: number;
}

export interface CatalogApi<T extends CatalogItem> {
  /** Inclui os arquivados (`archivedAt` preenchido). */
  list(): Promise<T[]>;
  register(name: string): Promise<T>;
  update(id: string, input: { name: string; version: number }): Promise<T>;
  archive(id: string, version: number): Promise<T>;
  restore(id: string, version: number): Promise<T>;
}

/** Cliente HTTP para os recursos de cadastro que seguem o mesmo formato de rotas. */
export function httpCatalogApi<T extends CatalogItem>(
  path: string,
  itemSchema: z.ZodType<T>,
  listSchema: z.ZodType<{ items: T[] }>,
): CatalogApi<T> {
  const itemPath = (id: string) => `${path}/${encodeURIComponent(id)}`;
  return {
    async list() {
      const { items } = await apiRequest(listSchema, path);
      return items;
    },
    register(name) {
      return apiRequest(itemSchema, path, { method: 'POST', body: JSON.stringify({ name }) });
    },
    update(id, input) {
      return apiRequest(itemSchema, itemPath(id), { method: 'PUT', body: JSON.stringify(input) });
    },
    archive(id, version) {
      return apiRequest(itemSchema, `${itemPath(id)}/archive`, {
        method: 'POST',
        body: JSON.stringify({ version }),
      });
    },
    restore(id, version) {
      return apiRequest(itemSchema, `${itemPath(id)}/restore`, {
        method: 'POST',
        body: JSON.stringify({ version }),
      });
    },
  };
}
