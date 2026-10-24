export { checkDatabase, createDatabase, type Database } from './persistence/database.ts';
export { PrismaSubjectRepository } from './modules/school-structure/prisma-subject-repository.ts';
export { PrismaResourceRepository } from './modules/school-structure/prisma-resource-repository.ts';
export { PrismaTeacherRepository } from './modules/teaching/prisma-teacher-repository.ts';
export { PrismaClassGroupRepository } from './modules/school-structure/prisma-class-group-repository.ts';
export { PrismaShiftRepository } from './modules/school-structure/prisma-shift-repository.ts';
export { PrismaAssignmentRepository } from './modules/teaching/prisma-assignment-repository.ts';
export { randomSeeds, sha256Digest, systemClock, uuidGenerator } from './system/system-ports.ts';
export {
  LOG_LEVELS,
  createLogger,
  loggerOptions,
  type LogLevel,
  type Logger,
} from './logging/logger.ts';

export { type PersistenceClient } from './persistence/database.ts';
export { createAccessUnitOfWork, sessionActor, audit } from './modules/access/unit-of-work.ts';
export {
  prepareAccount,
  preparePassword,
  publicUser,
  bootstrapAdmin,
} from './modules/access/accounts.ts';
export { hashToken } from './modules/access/passwords.ts';
export { PrismaPlanningRepository } from './modules/planning/prisma-planning-repository.ts';
export { PrismaGridRepository } from './modules/planning/prisma-grid-repository.ts';
export {
  PrismaGenerationQueue,
  PrismaGenerationRunRepository,
} from './modules/generation/prisma-generation-repository.ts';

export { PrismaSessionRepository } from './modules/access/prisma-session-repository.ts';
export { PrismaAuditReader } from './modules/access/prisma-audit-reader.ts';
export { PrismaLoginStore } from './modules/access/prisma-login-store.ts';

export { PrismaAccountRepository } from './modules/access/prisma-account-repository.ts';
export { hashPassword, verifyPassword, newToken } from './modules/access/passwords.ts';
