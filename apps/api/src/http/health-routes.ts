import type { FastifyInstance } from 'fastify';

export interface HealthDeps {
  checkReadiness(): Promise<void>;
}

export function registerHealthRoutes(app: FastifyInstance, { checkReadiness }: HealthDeps): void {
  // Liveness: o processo responde. Não depende do banco para não reiniciar a API em quedas dele.
  app.get('/health', async () => ({ status: 'ok' }));

  // Readiness: a API consegue atender requisições de negócio.
  app.get('/health/ready', async (request, reply) => {
    try {
      await checkReadiness();
      return { status: 'ok' };
    } catch (error) {
      request.log.warn({ err: error }, 'verificação de prontidão falhou');
      return reply.status(503).send({ status: 'unavailable' });
    }
  });
}
