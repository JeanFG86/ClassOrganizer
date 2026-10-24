import {
  changeClassGroupScheduleRequestSchema,
  registerClassGroupRequestSchema,
  updateClassGroupRequestSchema,
  versionRequestSchema,
} from '@classorganizer/contracts';

import type { FastifyInstance } from 'fastify';
import { idParamsSchema, parseRequest } from './errors.ts';
import {
  ClassGroupController,
  type ClassGroupOperations,
} from '../controllers/class-group-controller.ts';
export type ClassGroupRoutesDeps = ClassGroupOperations;

export function registerClassGroupRoutes(app: FastifyInstance, deps: ClassGroupRoutesDeps): void {
  const controller = new ClassGroupController(deps);
  app.get('/api/v1/class-groups', () => controller.listClassGroups());

  app.post('/api/v1/class-groups', async (request, reply) => {
    const input = parseRequest(registerClassGroupRequestSchema, request.body);
    const classGroup = await controller.registerClassGroup(input);
    return reply.status(201).send(classGroup);
  });

  app.put('/api/v1/class-groups/:id', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(updateClassGroupRequestSchema, request.body);
    return await controller.updateClassGroup({ id, ...input });
  });

  app.put('/api/v1/class-groups/:id/schedule', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(changeClassGroupScheduleRequestSchema, request.body);
    return await controller.changeClassGroupSchedule({ id, ...input });
  });

  app.post('/api/v1/class-groups/:id/archive', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return await controller.archiveClassGroup({ id, version });
  });

  app.post('/api/v1/class-groups/:id/restore', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return await controller.restoreClassGroup({ id, version });
  });
}
