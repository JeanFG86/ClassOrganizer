import {
  makeArchiveClassGroup,
  makeArchiveResource,
  makeListResources,
  makeRegisterResource,
  makeRestoreResource,
  makeUpdateResource,
  makeArchiveShift,
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
  makeRegisterTeacher,
  makeRemoveAssignment,
  makeRestoreClassGroup,
  makeRestoreShift,
  makeRestoreTeacher,
  makeUpdateClassGroup,
  makeUpdateShift,
  makeUpdateTeacher,
} from '@classorganizer/core';
import {
  PrismaAssignmentRepository,
  PrismaClassGroupRepository,
  PrismaResourceRepository,
  PrismaShiftRepository,
  PrismaSubjectRepository,
  PrismaTeacherRepository,
  systemClock,
  uuidGenerator,
} from '@classorganizer/infrastructure';
import type { PersistenceClient } from '@classorganizer/infrastructure';
import { composeSubjects } from './composition/subjects.ts';
export function makeCatalogServices(db: PersistenceClient) {
  const subjects = new PrismaSubjectRepository(db);
  const teachers = new PrismaTeacherRepository(db);
  const classGroups = new PrismaClassGroupRepository(db);
  const shifts = new PrismaShiftRepository(db);
  const assignments = new PrismaAssignmentRepository(db);
  const resources = new PrismaResourceRepository(db);
  const clock = systemClock;
  const ids = uuidGenerator;

  return {
    ...composeSubjects(db),
    listSubjects: makeListSubjects({ subjects }),
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
    registerResource: makeRegisterResource({ resources, clock, ids }),
    listResources: makeListResources({ resources }),
    updateResource: makeUpdateResource({ resources }),
    archiveResource: makeArchiveResource({ resources, clock }),
    restoreResource: makeRestoreResource({ resources }),
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
      resources,
      clock,
      ids,
    }),
    listAssignments: makeListAssignments({ assignments }),
    changeAssignment: makeChangeAssignment({ assignments, teachers, subjects, resources }),
    removeAssignment: makeRemoveAssignment({ assignments }),
  };
}
