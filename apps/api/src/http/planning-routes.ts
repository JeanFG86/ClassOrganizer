import { createPlanningSchema, changePlanningSchema } from '@classorganizer/contracts';
import { idParamsSchema, parseRequest } from './errors.ts';

import type { FastifyInstance } from 'fastify';
import { PlanningController, type PlanningOperations } from '../controllers/planning-controller.ts';
export function registerPlanningRoutes(app: FastifyInstance, operations: PlanningOperations): void {
  const controller = new PlanningController(operations);
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
