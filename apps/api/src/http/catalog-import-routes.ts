import {
  CSV_MEDIA_TYPE,
  catalogImportPreviewRequestSchema,
  catalogImportRequestSchema,
  catalogImportTemplateParamsSchema,
} from '@classorganizer/contracts';
import type { FastifyInstance } from 'fastify';
import {
  CatalogImportController,
  type CatalogImportOperations,
} from '../controllers/catalog-import-controller.ts';
import { parseRequest } from './errors.ts';

/** O arquivo vai no corpo JSON; o domínio limita o tamanho com mensagem própria. */
const IMPORT_BODY_LIMIT = 2 * 1024 * 1024;

export function registerCatalogImportRoutes(
  app: FastifyInstance,
  operations: CatalogImportOperations,
): void {
  const controller = new CatalogImportController(operations);

  app.get('/api/v1/catalog-imports/:kind/template', async (request, reply) => {
    const file = await controller.template(
      parseRequest(catalogImportTemplateParamsSchema, request.params),
    );
    return reply
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', `attachment; filename="${file.fileName}"`)
      .type(`${CSV_MEDIA_TYPE}; charset=utf-8`)
      .send(file.content);
  });

  app.post('/api/v1/catalog-imports/preview', { bodyLimit: IMPORT_BODY_LIMIT }, async (request) =>
    controller.preview(parseRequest(catalogImportPreviewRequestSchema, request.body)),
  );

  app.post('/api/v1/catalog-imports', { bodyLimit: IMPORT_BODY_LIMIT }, async (request, reply) =>
    reply
      .code(201)
      .send(await controller.import(parseRequest(catalogImportRequestSchema, request.body))),
  );
}
