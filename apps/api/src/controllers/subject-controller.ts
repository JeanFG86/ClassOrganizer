import type { SubjectDto, SubjectListDto } from '@classorganizer/contracts';
import type {
  RegisterSubject,
  ListSubjects,
  UpdateSubject,
  ArchiveSubject,
  RestoreSubject,
  Subject,
} from '@classorganizer/core';

export interface SubjectOperations {
  registerSubject: RegisterSubject['execute'];
  listSubjects: ListSubjects['execute'];
  updateSubject: UpdateSubject['execute'];
  archiveSubject: ArchiveSubject['execute'];
  restoreSubject: RestoreSubject['execute'];
}

function toDto(subject: Subject): SubjectDto {
  return {
    id: subject.id,
    name: subject.name,
    createdAt: subject.createdAt.toISOString(),
    archivedAt: subject.archivedAt?.toISOString() ?? null,
    version: subject.version,
  };
}

/** Recebe somente operações já autorizadas; não cria serviços nem acessa persistência. */
export class SubjectController {
  readonly #operations: SubjectOperations;
  constructor(operations: SubjectOperations) {
    this.#operations = operations;
  }

  async list(): Promise<SubjectListDto> {
    return { items: (await this.#operations.listSubjects()).map(toDto) };
  }
  async register(input: Parameters<RegisterSubject['execute']>[0]): Promise<SubjectDto> {
    return toDto(await this.#operations.registerSubject(input));
  }
  async update(input: Parameters<UpdateSubject['execute']>[0]): Promise<SubjectDto> {
    return toDto(await this.#operations.updateSubject(input));
  }
  async archive(input: Parameters<ArchiveSubject['execute']>[0]): Promise<SubjectDto> {
    return toDto(await this.#operations.archiveSubject(input));
  }
  async restore(input: Parameters<RestoreSubject['execute']>[0]): Promise<SubjectDto> {
    return toDto(await this.#operations.restoreSubject(input));
  }
}
