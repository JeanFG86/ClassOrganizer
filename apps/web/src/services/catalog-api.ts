import type { z } from 'zod';
import { httpClient, type HttpClient } from './api-client.ts';

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
export class CatalogHttpApi<T extends CatalogItem> implements CatalogApi<T> {
  readonly #operations: CatalogApi<T>;
  constructor(
    path: string,
    itemSchema: z.ZodType<T>,
    listSchema: z.ZodType<{ items: T[] }>,
    client: HttpClient = httpClient,
  ) {
    const itemPath = (id: string) => `${path}/${encodeURIComponent(id)}`;
    this.#operations = {
      async list() {
        const { items } = await client.request(listSchema, path);
        return items;
      },
      register(name) {
        return client.request(itemSchema, path, { method: 'POST', body: JSON.stringify({ name }) });
      },
      update(id, input) {
        return client.request(itemSchema, itemPath(id), {
          method: 'PUT',
          body: JSON.stringify(input),
        });
      },
      archive(id, version) {
        return client.request(itemSchema, `${itemPath(id)}/archive`, {
          method: 'POST',
          body: JSON.stringify({ version }),
        });
      },
      restore(id, version) {
        return client.request(itemSchema, `${itemPath(id)}/restore`, {
          method: 'POST',
          body: JSON.stringify({ version }),
        });
      },
    };
  }
  list() {
    return this.#operations.list();
  }
  register(name: string) {
    return this.#operations.register(name);
  }
  update(id: string, input: { name: string; version: number }) {
    return this.#operations.update(id, input);
  }
  archive(id: string, version: number) {
    return this.#operations.archive(id, version);
  }
  restore(id: string, version: number) {
    return this.#operations.restore(id, version);
  }
}

export function httpCatalogApi<T extends CatalogItem>(
  path: string,
  itemSchema: z.ZodType<T>,
  listSchema: z.ZodType<{ items: T[] }>,
  client: HttpClient = httpClient,
): CatalogApi<T> {
  const api = new CatalogHttpApi(path, itemSchema, listSchema, client);
  // Alguns clientes estendem o cadastro por composição; os métodos precisam ser próprios.
  return {
    list: api.list.bind(api),
    register: api.register.bind(api),
    update: api.update.bind(api),
    archive: api.archive.bind(api),
    restore: api.restore.bind(api),
  };
}
