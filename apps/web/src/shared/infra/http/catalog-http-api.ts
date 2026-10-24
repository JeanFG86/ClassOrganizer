import type { z } from 'zod';
import type { CatalogApi, CatalogItem } from '../../application/catalog-api.ts';
import type { HttpClient } from '../../application/ports/http-client.ts';

/** Cliente HTTP para os cadastros que seguem o mesmo formato de rotas. */
export function httpCatalogApi<T extends CatalogItem>(
  path: string,
  itemSchema: z.ZodType<T>,
  listSchema: z.ZodType<{ items: T[] }>,
  client: HttpClient,
): CatalogApi<T> {
  const itemPath = (id: string) => `${path}/${encodeURIComponent(id)}`;
  return {
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
