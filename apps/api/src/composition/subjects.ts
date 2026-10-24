import {
  ArchiveSubject,
  ListSubjects,
  RegisterSubject,
  RestoreSubject,
  UpdateSubject,
  bindUseCase,
} from '@classorganizer/core';
import {
  PrismaSubjectRepository,
  systemClock,
  uuidGenerator,
  type PersistenceClient,
} from '@classorganizer/infrastructure';

export function composeSubjects(db: PersistenceClient) {
  const subjects = new PrismaSubjectRepository(db);
  return {
    registerSubject: bindUseCase(
      new RegisterSubject({ subjects, clock: systemClock, ids: uuidGenerator }),
    ),
    listSubjects: bindUseCase(new ListSubjects({ subjects })),
    updateSubject: bindUseCase(new UpdateSubject({ subjects })),
    archiveSubject: bindUseCase(new ArchiveSubject({ subjects, clock: systemClock })),
    restoreSubject: bindUseCase(new RestoreSubject({ subjects })),
  };
}
