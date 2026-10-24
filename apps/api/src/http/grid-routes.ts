import {
  gridCommandSchema,
  gridQuerySchema,
  gridRulesChangeSchema,
  gridUndoSchema,
} from '@classorganizer/contracts';
import { idParamsSchema, parseRequest } from './errors.ts';

import type { FastifyInstance } from 'fastify';
import { GridController, type GridOperations } from '../controllers/grid-controller.ts';
export function registerGridRoutes(app: FastifyInstance, operations: GridOperations): void {
  const controller = new GridController(operations);
  app.get('/api/v1/plannings/:id/grid', (request) =>
    controller.viewGrid({
      ...parseRequest(gridQuerySchema, request.query),
      ...parseRequest(idParamsSchema, request.params),
    }),
  );
  app.post('/api/v1/plannings/:id/grid/preview', (request) =>
    controller.previewGrid({
      ...parseRequest(gridCommandSchema, request.body),
      ...parseRequest(idParamsSchema, request.params),
    }),
  );
  app.post('/api/v1/plannings/:id/grid/operations', (request) =>
    controller.applyGrid({
      ...parseRequest(gridCommandSchema, request.body),
      ...parseRequest(idParamsSchema, request.params),
    }),
  );
  app.post('/api/v1/plannings/:id/grid/undo', (request) =>
    controller.undoGrid({
      ...parseRequest(gridUndoSchema, request.body),
      ...parseRequest(idParamsSchema, request.params),
    }),
  );
  app.put('/api/v1/plannings/:id/grid/rules', (request) =>
    controller.changeGridRules({
      ...parseRequest(gridRulesChangeSchema, request.body),
      ...parseRequest(idParamsSchema, request.params),
    }),
  );
}
