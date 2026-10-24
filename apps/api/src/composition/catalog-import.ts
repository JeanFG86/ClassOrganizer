import {
  GetCatalogImportTemplate,
  ImportCatalog,
  PreviewCatalogImport,
  bindUseCase,
} from '@classorganizer/core';
import {
  PrismaAssignmentRepository,
  PrismaClassGroupRepository,
  PrismaResourceRepository,
  PrismaShiftRepository,
  PrismaSubjectRepository,
  PrismaTeacherRepository,
  sha256Digest,
  systemClock,
  uuidGenerator,
  type PersistenceClient,
} from '@classorganizer/infrastructure';

/** Importação CSV dos cadastros sobre o cliente da transação (ADR 0021). */
export function composeCatalogImport(db: PersistenceClient) {
  const deps = {
    subjects: new PrismaSubjectRepository(db),
    classGroups: new PrismaClassGroupRepository(db),
    shifts: new PrismaShiftRepository(db),
    resources: new PrismaResourceRepository(db),
    teachers: new PrismaTeacherRepository(db),
    assignments: new PrismaAssignmentRepository(db),
    clock: systemClock,
    ids: uuidGenerator,
    digest: sha256Digest,
  };

  return {
    template: bindUseCase(new GetCatalogImportTemplate()),
    preview: bindUseCase(new PreviewCatalogImport(deps)),
    apply: bindUseCase(new ImportCatalog(deps)),
  };
}
