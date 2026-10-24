import {
  credentialsSchema,
  createUserSchema,
  changeUserSchema,
  changePasswordSchema,
} from '@classorganizer/contracts';
import { idParamsSchema, parseRequest } from './errors.ts';

import type { FastifyInstance } from 'fastify';
import { AccessController, type AccessOperations } from '../controllers/access-controller.ts';
import { sessionCookie } from './security.ts';
export function registerAccessRoutes(
  app: FastifyInstance,
  operations: AccessOperations,
  origin: string,
): void {
  const controller = new AccessController(operations);
  const cookie = (token: string, maxAge: number) => sessionCookie(token, maxAge, origin);
  app.post('/api/v1/auth/login', async (request, reply) => {
    const input = parseRequest(credentialsSchema, request.body);
    const result = await controller.login(input.username, input.password, request.ip);
    reply.header('set-cookie', cookie(result.token, 8 * 60 * 60));
    return { user: result.user, expiresAt: result.expiresAt };
  });
  app.get('/api/v1/auth/session', () => controller.session());
  app.post('/api/v1/auth/logout', async (_request, reply) => {
    await controller.logout();
    reply.header('set-cookie', cookie('', 0));
    return reply.code(204).send();
  });
  app.post('/api/v1/auth/password', async (request, reply) => {
    const input = parseRequest(changePasswordSchema, request.body);
    await controller.changePassword(input);
    reply.header('set-cookie', cookie('', 0));
    return reply.code(204).send();
  });
  app.get('/api/v1/users', () => controller.listUsers());
  app.post('/api/v1/users', async (request, reply) => {
    const input = parseRequest(createUserSchema, request.body);
    return reply.code(201).send(await controller.createUser(input));
  });
  app.put('/api/v1/users/:id', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(changeUserSchema, request.body);
    return controller.changeUser({ id, ...input });
  });
}
