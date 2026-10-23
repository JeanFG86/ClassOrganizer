import {
  makeArchiveClassGroup,
  makeArchiveShift,
  makeArchiveSubject,
  makeArchiveTeacher,
  makeAssignTeaching,
  makeChangeClassGroupSchedule,
  makeChangeAssignment,
  makeListAssignments,
  makeListClassGroups,
  makeListShifts,
  makeListSubjects,
  makeListTeachers,
  makeRegisterClassGroup,
  makeRegisterShift,
  makeRegisterSubject,
  makeRegisterTeacher,
  makeRemoveAssignment,
  makeRestoreClassGroup,
  makeRestoreShift,
  makeRestoreSubject,
  makeRestoreTeacher,
  makeUpdateClassGroup,
  makeUpdateShift,
  makeUpdateSubject,
  makeUpdateTeacher,
} from '@classorganizer/core';
import {
  PrismaAssignmentRepository,
  PrismaClassGroupRepository,
  PrismaShiftRepository,
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
const shifts = new PrismaShiftRepository(db);
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
    changeClassGroupSchedule: makeChangeClassGroupSchedule({ classGroups, shifts }),
    archiveClassGroup: makeArchiveClassGroup({ classGroups, clock }),
    restoreClassGroup: makeRestoreClassGroup({ classGroups }),
    registerShift: makeRegisterShift({ shifts, clock, ids }),
    listShifts: makeListShifts({ shifts }),
    updateShift: makeUpdateShift({ shifts, classGroups, ids }),
    archiveShift: makeArchiveShift({ shifts, classGroups, clock }),
    restoreShift: makeRestoreShift({ shifts }),
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
