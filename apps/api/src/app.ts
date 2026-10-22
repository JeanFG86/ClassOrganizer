import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import { registerErrorHandling } from './http/errors.ts';
import { registerHealthRoutes } from './http/health-routes.ts';
import type { HealthDeps } from './http/health-routes.ts';
import { registerSubjectRoutes } from './http/subject-routes.ts';
import type { SubjectRoutesDeps } from './http/subject-routes.ts';

export type AppDeps = HealthDeps & SubjectRoutesDeps;

export interface AppOptions {
  logger: FastifyServerOptions['logger'];
}

/** Monta a aplicação HTTP a partir dos casos de uso já compostos. Não abre portas. */
export function buildApp(deps: AppDeps, options: AppOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  });

  registerErrorHandling(app);
  registerHealthRoutes(app, deps);
  registerSubjectRoutes(app, deps);

  return app;
}
