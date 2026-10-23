import { Prisma } from '../generated/prisma/client.ts';

/** Códigos de erro do Prisma traduzidos pelos repositórios. */
export const PrismaErrorCode = {
  uniqueViolation: 'P2002',
  foreignKeyViolation: 'P2003',
} as const;

export function isPrismaError(
  error: unknown,
  code: (typeof PrismaErrorCode)[keyof typeof PrismaErrorCode],
): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/** Executa a operação traduzindo um código de erro do Prisma para um erro de domínio. */
export async function translatePrismaError<T>(
  operation: () => Promise<T>,
  code: (typeof PrismaErrorCode)[keyof typeof PrismaErrorCode],
  toDomainError: () => Error,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isPrismaError(error, code)) {
      throw toDomainError();
    }
    throw error;
  }
}
