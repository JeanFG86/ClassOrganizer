import {
  registerResourceRequestSchema,
  updateResourceRequestSchema,
  versionRequestSchema,
} from '@classorganizer/contracts';

import type { FastifyInstance } from 'fastify';
import { idParamsSchema, parseRequest } from './errors.ts';
import { ResourceController, type ResourceOperations } from '../controllers/resource-controller.ts';
export type ResourceRoutesDeps = ResourceOperations;

export function registerResourceRoutes(app: FastifyInstance, deps: ResourceRoutesDeps): void {
  const controller = new ResourceController(deps);
  app.get('/api/v1/resources', () => controller.listResources());

  app.post('/api/v1/resources', async (request, reply) => {
    const input = parseRequest(registerResourceRequestSchema, request.body);
    const resource = await controller.registerResource(input);
    return reply.status(201).send(resource);
  });

  app.put('/api/v1/resources/:id', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(updateResourceRequestSchema, request.body);
    return await controller.updateResource({ id, ...input });
  });

  app.post('/api/v1/resources/:id/archive', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return await controller.archiveResource({ id, version });
  });

  app.post('/api/v1/resources/:id/restore', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return await controller.restoreResource({ id, version });
  });
}
