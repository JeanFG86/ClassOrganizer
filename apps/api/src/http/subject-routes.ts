import {
  registerSubjectRequestSchema,
  updateSubjectRequestSchema,
  versionRequestSchema,
} from '@classorganizer/contracts';
import type { FastifyInstance } from 'fastify';
import { SubjectController, type SubjectOperations } from '../controllers/subject-controller.ts';
import { idParamsSchema, parseRequest } from './errors.ts';
export type SubjectRoutesDeps = SubjectOperations;

export function registerSubjectRoutes(app: FastifyInstance, deps: SubjectRoutesDeps): void {
  const controller = new SubjectController(deps);
  app.get('/api/v1/subjects', () => controller.list());

  app.post('/api/v1/subjects', async (request, reply) => {
    const input = parseRequest(registerSubjectRequestSchema, request.body);
    return reply.status(201).send(await controller.register(input));
  });

  app.put('/api/v1/subjects/:id', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(updateSubjectRequestSchema, request.body);
    return controller.update({ id, ...input });
  });

  app.post('/api/v1/subjects/:id/archive', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return controller.archive({ id, version });
  });

  app.post('/api/v1/subjects/:id/restore', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return controller.restore({ id, version });
  });
}
