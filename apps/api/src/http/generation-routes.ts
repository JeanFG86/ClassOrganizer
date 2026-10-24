import {
  gridQuerySchema,
  generationCommandSchema,
  generationRequestCommandSchema,
  generationParamsSchema,
} from '@classorganizer/contracts';
import { idParamsSchema, parseRequest } from './errors.ts';

import type { FastifyInstance } from 'fastify';
import {
  GenerationController,
  type GenerationOperations,
} from '../controllers/generation-controller.ts';
export function registerGenerationRoutes(
  app: FastifyInstance,
  operations: GenerationOperations,
): void {
  const controller = new GenerationController(operations);
  app.get('/api/v1/plannings/:id/generations', (request) =>
    controller.listGenerations({
      ...parseRequest(gridQuerySchema, request.query),
      ...parseRequest(idParamsSchema, request.params),
    }),
  );
  app.post('/api/v1/plannings/:id/generations', async (request, reply) =>
    reply.code(201).send(
      await controller.requestGeneration({
        ...parseRequest(generationRequestCommandSchema, request.body),
        ...parseRequest(idParamsSchema, request.params),
      }),
    ),
  );
  app.get('/api/v1/plannings/:id/generations/:runId', (request) =>
    controller.detailGeneration(parseRequest(generationParamsSchema, request.params)),
  );
  app.post('/api/v1/plannings/:id/generations/:runId/cancel', (request) =>
    controller.cancelGeneration(parseRequest(generationParamsSchema, request.params)),
  );
  app.post('/api/v1/plannings/:id/generations/:runId/apply', (request) =>
    controller.applyGeneration({
      ...parseRequest(generationCommandSchema, request.body),
      ...parseRequest(generationParamsSchema, request.params),
    }),
  );
}
