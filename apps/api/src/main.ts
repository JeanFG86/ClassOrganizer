import {
  makeArchiveClassGroup,
  makeArchiveSubject,
  makeArchiveTeacher,
  makeAssignTeaching,
  makeChangeAssignment,
  makeListAssignments,
  makeListClassGroups,
  makeListSubjects,
  makeListTeachers,
  makeRegisterClassGroup,
  makeRegisterSubject,
  makeRegisterTeacher,
  makeRemoveAssignment,
  makeRestoreClassGroup,
  makeRestoreSubject,
  makeRestoreTeacher,
  makeUpdateClassGroup,
  makeUpdateSubject,
  makeUpdateTeacher,
} from '@classorganizer/core';
import {
  PrismaAssignmentRepository,
  PrismaClassGroupRepository,
  PrismaSubjectRepository,
  PrismaTeacherRepository,
  checkDatabase,
  createDatabase,
  loggerOptions,
  systemClock,
  uuidGenerator,
} from '@classorganizer/infrastructure';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

// Raiz de composição da API: único ponto que conhece as implementações concretas.
const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);
const subjects = new PrismaSubjectRepository(db);
const teachers = new PrismaTeacherRepository(db);
const classGroups = new PrismaClassGroupRepository(db);
const assignments = new PrismaAssignmentRepository(db);
const clock = systemClock;
const ids = uuidGenerator;

const app = buildApp(
  {
    registerSubject: makeRegisterSubject({ subjects, clock, ids }),
    listSubjects: makeListSubjects({ subjects }),
    updateSubject: makeUpdateSubject({ subjects }),
    archiveSubject: makeArchiveSubject({ subjects, clock }),
    restoreSubject: makeRestoreSubject({ subjects }),
    registerTeacher: makeRegisterTeacher({ teachers, subjects, clock, ids }),
    listTeachers: makeListTeachers({ teachers }),
    updateTeacher: makeUpdateTeacher({ teachers, subjects, assignments }),
    archiveTeacher: makeArchiveTeacher({ teachers, assignments, clock }),
    restoreTeacher: makeRestoreTeacher({ teachers }),
    registerClassGroup: makeRegisterClassGroup({ classGroups, clock, ids }),
    listClassGroups: makeListClassGroups({ classGroups }),
    updateClassGroup: makeUpdateClassGroup({ classGroups }),
    archiveClassGroup: makeArchiveClassGroup({ classGroups, clock }),
    restoreClassGroup: makeRestoreClassGroup({ classGroups }),
    assignTeaching: makeAssignTeaching({
      assignments,
      teachers,
      subjects,
      classGroups,
      clock,
      ids,
    }),
    listAssignments: makeListAssignments({ assignments }),
    changeAssignment: makeChangeAssignment({ assignments, teachers }),
    removeAssignment: makeRemoveAssignment({ assignments }),
    checkReadiness: () => checkDatabase(db),
  },
  { logger: loggerOptions('api', config.LOG_LEVEL) },
);

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'encerrando a API');
  await app.close();
  await db.$disconnect();
  process.exit(0);
}

process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));

await app.listen({ host: config.API_HOST, port: config.API_PORT });
