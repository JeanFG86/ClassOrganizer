import {
  bindUseCase,
  RegisterTeacher,
  ListTeachers,
  UpdateTeacher,
  ArchiveTeacher,
  RestoreTeacher,
  ChangeTeacherAvailability,
  RegisterClassGroup,
  ListClassGroups,
  UpdateClassGroup,
  ChangeClassGroupSchedule,
  ArchiveClassGroup,
  RestoreClassGroup,
  RegisterResource,
  ListResources,
  UpdateResource,
  ArchiveResource,
  RestoreResource,
  RegisterShift,
  ListShifts,
  UpdateShift,
  ArchiveShift,
  RestoreShift,
  AssignTeaching,
  ListAssignments,
  ChangeAssignment,
  RemoveAssignment,
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
    registerTeacher: bindUseCase(new RegisterTeacher({ teachers, subjects, clock, ids })),
    listTeachers: bindUseCase(new ListTeachers({ teachers })),
    updateTeacher: bindUseCase(new UpdateTeacher({ teachers, subjects, assignments })),
    archiveTeacher: bindUseCase(new ArchiveTeacher({ teachers, assignments, clock })),
    restoreTeacher: bindUseCase(new RestoreTeacher({ teachers })),
    changeTeacherAvailability: bindUseCase(
      new ChangeTeacherAvailability({ teachers, periods: shifts }),
    ),
    registerClassGroup: bindUseCase(new RegisterClassGroup({ classGroups, clock, ids })),
    listClassGroups: bindUseCase(new ListClassGroups({ classGroups })),
    updateClassGroup: bindUseCase(new UpdateClassGroup({ classGroups })),
    changeClassGroupSchedule: bindUseCase(new ChangeClassGroupSchedule({ classGroups, shifts })),
    archiveClassGroup: bindUseCase(new ArchiveClassGroup({ classGroups, clock })),
    restoreClassGroup: bindUseCase(new RestoreClassGroup({ classGroups })),
    registerResource: bindUseCase(new RegisterResource({ resources, clock, ids })),
    listResources: bindUseCase(new ListResources({ resources })),
    updateResource: bindUseCase(new UpdateResource({ resources })),
    archiveResource: bindUseCase(new ArchiveResource({ resources, clock })),
    restoreResource: bindUseCase(new RestoreResource({ resources })),
    registerShift: bindUseCase(new RegisterShift({ shifts, clock, ids })),
    listShifts: bindUseCase(new ListShifts({ shifts })),
    updateShift: bindUseCase(new UpdateShift({ shifts, classGroups, ids })),
    archiveShift: bindUseCase(new ArchiveShift({ shifts, classGroups, clock })),
    restoreShift: bindUseCase(new RestoreShift({ shifts })),
    assignTeaching: bindUseCase(
      new AssignTeaching({
        assignments,
        teachers,
        subjects,
        classGroups,
        resources,
        clock,
        ids,
      }),
    ),
    listAssignments: bindUseCase(new ListAssignments({ assignments })),
    changeAssignment: bindUseCase(
      new ChangeAssignment({ assignments, teachers, subjects, resources }),
    ),
    removeAssignment: bindUseCase(new RemoveAssignment({ assignments })),
  };
}
