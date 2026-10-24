import {
  createAssignmentRequestSchema,
  removeAssignmentQuerySchema,
  updateAssignmentRequestSchema,
} from '@classorganizer/contracts';

import type { FastifyInstance } from 'fastify';
import { idParamsSchema, parseRequest } from './errors.ts';
import {
  AssignmentController,
  type AssignmentOperations,
} from '../controllers/assignment-controller.ts';
export type AssignmentRoutesDeps = AssignmentOperations;

export function registerAssignmentRoutes(app: FastifyInstance, deps: AssignmentRoutesDeps): void {
  const controller = new AssignmentController(deps);
  app.get('/api/v1/assignments', () => controller.listAssignments());

  app.post('/api/v1/assignments', async (request, reply) => {
    const input = parseRequest(createAssignmentRequestSchema, request.body);
    const assignment = await controller.assignTeaching(input);
    return reply.status(201).send(assignment);
  });

  app.put('/api/v1/assignments/:id', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(updateAssignmentRequestSchema, request.body);
    return await controller.changeAssignment({ id, ...input });
  });

  app.delete('/api/v1/assignments/:id', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(removeAssignmentQuerySchema, request.query);
    await controller.removeAssignment({ id, version });
    return reply.status(204).send();
  });
}
