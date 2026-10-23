import type { Prisma } from '../generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

export type Database = PrismaClient;

export function createDatabase(connectionString: string): Database {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Usado pelos healthchecks de prontidão. */
export async function checkDatabase(db: Database): Promise<void> {
  await db.$queryRaw`SELECT 1`;
}

export type PersistenceClient = Database | Prisma.TransactionClient;
export async function inTransaction<T>(
  db: PersistenceClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return '$transaction' in db ? db.$transaction(operation) : operation(db);
}
