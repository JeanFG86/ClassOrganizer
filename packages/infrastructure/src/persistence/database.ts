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
