import type { ApiError } from '@classorganizer/contracts';
import { DomainError } from '@classorganizer/core';
import type { DomainErrorKind } from '@classorganizer/core';
import type { FastifyError, FastifyInstance } from 'fastify';
import { z } from 'zod';

const STATUS_BY_KIND: Record<DomainErrorKind, number> = {
  validation: 400,
  conflict: 409,
  not_found: 404,
};

/** Entrada HTTP que não respeita o contrato publicado. */
export class RequestValidationError extends Error {
  readonly issues: string;

  constructor(error: z.ZodError) {
    super('A requisição contém dados inválidos.');
    this.issues = z.prettifyError(error);
  }
}

export function parseRequest<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new RequestValidationError(result.error);
  }
  return result.data;
}

function body(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof DomainError) {
      return reply.status(STATUS_BY_KIND[error.kind]).send(body(error.code, error.message));
    }
    if (error instanceof RequestValidationError) {
      request.log.info({ issues: error.issues }, 'requisição inválida');
      return reply.status(400).send(body('request.invalid', error.message));
    }
    if ('statusCode' in error && error.statusCode !== undefined && error.statusCode < 500) {
      return reply
        .status(error.statusCode)
        .send(body('request.invalid', 'A requisição não pôde ser processada.'));
    }

    request.log.error({ err: error }, 'erro não tratado');
    return reply.status(500).send(body('internal', 'Ocorreu um erro inesperado. Tente novamente.'));
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send(body('route.not_found', 'Recurso não encontrado.')),
  );
}
