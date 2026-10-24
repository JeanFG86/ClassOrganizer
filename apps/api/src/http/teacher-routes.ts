import {
  changeTeacherAvailabilityRequestSchema,
  registerTeacherRequestSchema,
  updateTeacherRequestSchema,
  versionRequestSchema,
} from '@classorganizer/contracts';

import type { FastifyInstance } from 'fastify';
import { idParamsSchema, parseRequest } from './errors.ts';
import { TeacherController, type TeacherOperations } from '../controllers/teacher-controller.ts';
export type TeacherRoutesDeps = TeacherOperations;

export function registerTeacherRoutes(app: FastifyInstance, deps: TeacherRoutesDeps): void {
  const controller = new TeacherController(deps);
  app.get('/api/v1/teachers', () => controller.listTeachers());

  app.post('/api/v1/teachers', async (request, reply) => {
    const input = parseRequest(registerTeacherRequestSchema, request.body);
    const teacher = await controller.registerTeacher(input);
    return reply.status(201).send(teacher);
  });

  app.put('/api/v1/teachers/:id', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(updateTeacherRequestSchema, request.body);
    return await controller.updateTeacher({ id, ...input });
  });

  app.put('/api/v1/teachers/:id/availability', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(changeTeacherAvailabilityRequestSchema, request.body);
    return await controller.changeTeacherAvailability({ id, ...input });
  });

  app.post('/api/v1/teachers/:id/archive', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return await controller.archiveTeacher({ id, version });
  });

  app.post('/api/v1/teachers/:id/restore', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return await controller.restoreTeacher({ id, version });
  });
}
