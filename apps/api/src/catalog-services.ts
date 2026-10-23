import {
  makeArchiveClassGroup,
  makeArchiveShift,
  makeArchiveSubject,
  makeArchiveTeacher,
  makeAssignTeaching,
  makeChangeClassGroupSchedule,
  makeChangeTeacherAvailability,
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
  systemClock,
  uuidGenerator,
} from '@classorganizer/infrastructure';
import type { PersistenceClient } from '@classorganizer/infrastructure';
export function makeCatalogServices(db: PersistenceClient) {
  const subjects = new PrismaSubjectRepository(db);
  const teachers = new PrismaTeacherRepository(db);
  const classGroups = new PrismaClassGroupRepository(db);
  const shifts = new PrismaShiftRepository(db);
  const assignments = new PrismaAssignmentRepository(db);
  const clock = systemClock;
  const ids = uuidGenerator;

  return {
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
    changeTeacherAvailability: makeChangeTeacherAvailability({ teachers, periods: shifts }),
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
    changeAssignment: makeChangeAssignment({ assignments, teachers, subjects }),
    removeAssignment: makeRemoveAssignment({ assignments }),
  };
}
