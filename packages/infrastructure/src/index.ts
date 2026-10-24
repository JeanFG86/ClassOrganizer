export { checkDatabase, createDatabase, type Database } from './persistence/database.ts';
export { PrismaSubjectRepository } from './persistence/prisma-subject-repository.ts';
export { PrismaResourceRepository } from './persistence/prisma-resource-repository.ts';
export { PrismaTeacherRepository } from './persistence/prisma-teacher-repository.ts';
export { PrismaClassGroupRepository } from './persistence/prisma-class-group-repository.ts';
export { PrismaShiftRepository } from './persistence/prisma-shift-repository.ts';
export { PrismaAssignmentRepository } from './persistence/prisma-assignment-repository.ts';
export { randomSeeds, sha256Digest, systemClock, uuidGenerator } from './system/system-ports.ts';
export {
  LOG_LEVELS,
  createLogger,
  loggerOptions,
  type LogLevel,
  type Logger,
} from './logging/logger.ts';

export { type PersistenceClient } from './persistence/database.ts';
export { createAccessUnitOfWork, sessionActor, audit } from './access/unit-of-work.ts';
export {
  makeAccounts,
  makeLogin,
  prepareAccount,
  preparePassword,
  publicUser,
  bootstrapAdmin,
} from './access/accounts.ts';
export { hashToken } from './access/passwords.ts';
export { PrismaPlanningRepository } from './persistence/prisma-planning-repository.ts';
export { PrismaGridRepository } from './persistence/prisma-grid-repository.ts';
export {
  PrismaGenerationQueue,
  PrismaGenerationRunRepository,
} from './persistence/prisma-generation-repository.ts';

export { PrismaSessionRepository } from './modules/access/prisma-session-repository.ts';
export { PrismaAuditReader } from './modules/access/prisma-audit-reader.ts';
