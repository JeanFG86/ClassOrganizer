import {
  createPlanningSchema,
  changePlanningSchema,
  renameRevisionSchema,
  restoreRevisionSchema,
  compareRevisionsSchema,
  timetableReportQuerySchema,
  timetableWorkbookQuerySchema,
  XLSX_MEDIA_TYPE,
} from '@classorganizer/contracts';
import { z } from 'zod';
import { idParamsSchema, parseRequest } from './errors.ts';

import type { FastifyInstance } from 'fastify';
import { PlanningController, type PlanningOperations } from '../controllers/planning-controller.ts';
export function registerPlanningRoutes(app: FastifyInstance, operations: PlanningOperations): void {
  const controller = new PlanningController(operations);
  const revisionParams = z.object({ id: z.uuid(), revisionId: z.uuid() });
  app.get('/api/v1/plannings/:id/workbook', async (request, reply) => {
    const file = await controller.timetableWorkbook({
      ...parseRequest(idParamsSchema, request.params),
      ...parseRequest(timetableWorkbookQuerySchema, request.query),
    });
    return reply
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', `attachment; filename="${file.fileName}"`)
      .type(XLSX_MEDIA_TYPE)
      .send(Buffer.from(file.content));
  });
  app.get('/api/v1/plannings/:id/report', (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return controller.timetableReport({
      ...parseRequest(idParamsSchema, request.params),
      ...parseRequest(timetableReportQuerySchema, request.query),
    });
  });
  app.post('/api/v1/plannings/:id/revisions/:revisionId/preserve', async (request, reply) =>
    reply.code(201).send(
      await controller.preserveRevision({
        ...parseRequest(revisionParams, request.params),
        ...parseRequest(restoreRevisionSchema, request.body),
      }),
    ),
  );
  app.get('/api/v1/plannings/:id/revisions/comparison', (request) =>
    controller.compareRevisions({
      ...parseRequest(idParamsSchema, request.params),
      ...parseRequest(compareRevisionsSchema, request.query),
    }),
  );
  app.get('/api/v1/plannings/:id/revisions/:revisionId/checklist', (request) =>
    controller.revisionChecklist(parseRequest(revisionParams, request.params)),
  );
  app.put('/api/v1/plannings/:id/revisions/:revisionId/name', (request) =>
    controller.renameRevision({
      ...parseRequest(revisionParams, request.params),
      ...parseRequest(renameRevisionSchema, request.body),
    }),
  );
  app.post('/api/v1/plannings/:id/revisions/:revisionId/restore', async (request, reply) =>
    reply.code(201).send(
      await controller.restoreRevision({
        ...parseRequest(revisionParams, request.params),
        ...parseRequest(restoreRevisionSchema, request.body),
      }),
    ),
  );
  app.get('/api/v1/plannings', () => controller.listPlannings());
  app.post('/api/v1/plannings', async (request, reply) =>
    reply
      .code(201)
      .send(await controller.createPlanning(parseRequest(createPlanningSchema, request.body))),
  );
  app.get('/api/v1/plannings/:id', (request) =>
    controller.detailPlanning(parseRequest(idParamsSchema, request.params).id),
  );
  app.put('/api/v1/plannings/:id', (request) =>
    controller.changePlanning({
      ...parseRequest(changePlanningSchema, request.body),
      ...parseRequest(idParamsSchema, request.params),
    }),
  );
}
