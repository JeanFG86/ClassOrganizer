import type { Clock, Digest, IdGenerator } from '../../../../shared/ports.ts';
import {
  CatalogImportEmptyError,
  CatalogImportInvalidError,
  CatalogImportStaleError,
} from '../../domain/catalog-import-error.ts';
import {
  importFingerprint,
  importIsValid,
  planCatalogImport,
  summarizeImport,
  type CatalogImportPlan,
  type CatalogImportState,
  type CatalogImportSummary,
} from '../../domain/import-plan.ts';
import { catalogImportTemplate, type CatalogImportKind } from '../../domain/layouts.ts';
import type { CatalogImportReaders, CatalogImportWriters } from '../ports/index.ts';

export interface CatalogImportPreview extends Omit<CatalogImportPlan, 'writes'> {
  /** Resumo do resultado mostrado; a confirmação só grava se o resultado ainda for o mesmo. */
  readonly digest: string;
  readonly summary: CatalogImportSummary;
}

/** Contagens de linhas: cadastradas agora e já existentes. */
export interface CatalogImportResult {
  readonly kind: CatalogImportKind;
  readonly created: number;
  readonly existing: number;
}

type PlanDependencies = CatalogImportReaders & { clock: Clock; ids: IdGenerator };

async function plan(
  deps: PlanDependencies,
  input: { kind: CatalogImportKind; content: string },
): Promise<CatalogImportPlan> {
  const state: CatalogImportState = {
    subjects: await deps.subjects.listAll(),
    classGroups: await deps.classGroups.listAll(),
    shifts: await deps.shifts.listAll(),
    resources: await deps.resources.listAll(),
    teachers: await deps.teachers.listAll(),
    assignments: await deps.assignments.listAll(),
  };
  return planCatalogImport({
    kind: input.kind,
    content: input.content,
    state,
    now: deps.clock.now(),
    nextId: () => deps.ids.next(),
  });
}

/** Modelo CSV de um tipo de cadastro, com cabeçalho e linhas de exemplo inventadas. */
export class GetCatalogImportTemplate {
  execute(input: { kind: CatalogImportKind }): { fileName: string; content: string } {
    return catalogImportTemplate(input.kind);
  }
}

export type PreviewCatalogImportDependencies = PlanDependencies & { digest: Digest };
/** Avalia cada linha sem gravar nada. */
export class PreviewCatalogImport {
  readonly #deps: PreviewCatalogImportDependencies;
  constructor(deps: PreviewCatalogImportDependencies) {
    this.#deps = deps;
  }
  async execute(input: {
    kind: CatalogImportKind;
    content: string;
  }): Promise<CatalogImportPreview> {
    const planned = await plan(this.#deps, input);

    const preview = {
      kind: planned.kind,
      columns: planned.columns,
      fileErrors: planned.fileErrors,
      rows: planned.rows,
    };

    return {
      ...preview,
      digest: this.#deps.digest.of(importFingerprint(preview)),
      summary: summarizeImport(planned),
    };
  }
}

export type ImportCatalogDependencies = CatalogImportWriters & {
  clock: Clock;
  ids: IdGenerator;
  digest: Digest;
};
/**
 * Confirma a prévia: avalia o mesmo arquivo de novo sobre os cadastros atuais, dentro da
 * transação que bloqueia o catálogo, e grava todas as linhas novas ou nenhuma. Alterações
 * de outros cadastros não invalidam a prévia; mudar o resultado de alguma linha, sim.
 */
export class ImportCatalog {
  readonly #deps: ImportCatalogDependencies;
  constructor(deps: ImportCatalogDependencies) {
    this.#deps = deps;
  }
  async execute(input: {
    kind: CatalogImportKind;
    content: string;
    digest: string;
  }): Promise<CatalogImportResult> {
    const deps = this.#deps;

    const planned = await plan(deps, input);

    if (deps.digest.of(importFingerprint(planned)) !== input.digest) {
      throw new CatalogImportStaleError();
    }

    if (!importIsValid(planned)) {
      throw new CatalogImportInvalidError();
    }

    if (planned.writes.length === 0) {
      throw new CatalogImportEmptyError();
    }

    for (const write of planned.writes) {
      switch (write.type) {
        case 'subject':
          await deps.subjects.add(write.subject);
          break;
        case 'classGroup':
          await deps.classGroups.add(write.classGroup);
          if (write.schedule) await deps.classGroups.update(write.schedule);
          break;
        case 'teacher':
          await deps.teachers.add(write.teacher);
          break;
        case 'assignment':
          await deps.assignments.add(write.assignment);
          break;
      }
    }

    const summary = summarizeImport(planned);

    return { kind: input.kind, created: summary.create, existing: summary.existing };
  }
}
