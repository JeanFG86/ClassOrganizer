import { z } from 'zod';

import { parseRequest } from './errors.ts';

import type { FastifyInstance } from 'fastify';
import { AuditController, type AuditOperations } from '../controllers/audit-controller.ts';
export function registerAuditRoutes(app: FastifyInstance, operations: AuditOperations): void {
  const controller = new AuditController(operations);
  app.get('/api/v1/audit', (request) => {
    const query = parseRequest(
      z
        .object({ before: z.iso.datetime().optional(), beforeId: z.uuid().optional() })
        .refine((value) => (value.before === undefined) === (value.beforeId === undefined), {
          message: 'Informe o cursor completo.',
        }),
      request.query,
    );
    return controller.listAudits(
      query.before && query.beforeId
        ? { at: new Date(query.before), id: query.beforeId }
        : undefined,
    );
  });
}
