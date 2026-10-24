import {
  ArchiveClassGroup,
  ArchiveResource,
  ArchiveShift,
  ArchiveSubject,
  ArchiveTeacher,
  AssignTeaching,
  ChangeAssignment,
  ChangeClassGroupSchedule,
  ChangeTeacherAvailability,
  ListAssignments,
  ListClassGroups,
  ListResources,
  ListShifts,
  ListSubjects,
  ListTeachers,
  RegisterClassGroup,
  RegisterResource,
  RegisterShift,
  RegisterSubject,
  RegisterTeacher,
  RemoveAssignment,
  RestoreClassGroup,
  RestoreResource,
  RestoreShift,
  RestoreSubject,
  RestoreTeacher,
  UpdateClassGroup,
  UpdateResource,
  UpdateShift,
  UpdateSubject,
  UpdateTeacher,
  bindUseCase,
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
  type PersistenceClient,
} from '@classorganizer/infrastructure';

/** Cadastros da base compartilhada sobre o cliente informado (transação ou conexão). */
export function composeCatalog(db: PersistenceClient) {
  const subjects = new PrismaSubjectRepository(db);
  const teachers = new PrismaTeacherRepository(db);
  const classGroups = new PrismaClassGroupRepository(db);
  const shifts = new PrismaShiftRepository(db);
  const assignments = new PrismaAssignmentRepository(db);
  const resources = new PrismaResourceRepository(db);
  const clock = systemClock;
  const ids = uuidGenerator;

  return {
    registerSubject: bindUseCase(new RegisterSubject({ subjects, clock, ids })),
    listSubjects: bindUseCase(new ListSubjects({ subjects })),
    updateSubject: bindUseCase(new UpdateSubject({ subjects })),
    archiveSubject: bindUseCase(new ArchiveSubject({ subjects, clock })),
    restoreSubject: bindUseCase(new RestoreSubject({ subjects })),
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

export type CatalogServices = ReturnType<typeof composeCatalog>;

/**
 * Classificação explícita de cada operação do catálogo. Escritas bloqueiam `app_state`,
 * avançam a versão do catálogo e geram auditoria `catalog.<operação>`; leituras, não.
 * Uma operação nova não compila sem ser classificada aqui.
 */
export const CATALOG_ACCESS: { readonly [Key in keyof CatalogServices]: 'read' | 'write' } = {
  registerSubject: 'write',
  listSubjects: 'read',
  updateSubject: 'write',
  archiveSubject: 'write',
  restoreSubject: 'write',
  registerTeacher: 'write',
  listTeachers: 'read',
  updateTeacher: 'write',
  archiveTeacher: 'write',
  restoreTeacher: 'write',
  changeTeacherAvailability: 'write',
  registerClassGroup: 'write',
  listClassGroups: 'read',
  updateClassGroup: 'write',
  changeClassGroupSchedule: 'write',
  archiveClassGroup: 'write',
  restoreClassGroup: 'write',
  registerResource: 'write',
  listResources: 'read',
  updateResource: 'write',
  archiveResource: 'write',
  restoreResource: 'write',
  registerShift: 'write',
  listShifts: 'read',
  updateShift: 'write',
  archiveShift: 'write',
  restoreShift: 'write',
  assignTeaching: 'write',
  listAssignments: 'read',
  changeAssignment: 'write',
  removeAssignment: 'write',
};
