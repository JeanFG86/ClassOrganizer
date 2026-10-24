import type { Clock } from '../../../../shared/ports.ts';
import { NotFoundError } from '../../../../shared/domain-error.ts';
import { StaleVersionError } from '../../../../shared/versioning.ts';
import { requireRole, READ_ROLES, type Actor } from '../../../access/domain/index.ts';
import { diagnoseGrid } from '../../domain/diagnosis.ts';
import { REVIEW_PENDING_NOTICE, isRevisionReviewed } from '../../domain/review-items.ts';
import { buildReportSheets, type ReportPerspective } from '../../domain/timetable-report.ts';
import { GridReader, type GridReaderDependencies } from '../services/grid-access.ts';

export type GetTimetableReportDependencies = GridReaderDependencies & { clock: Clock };
export class GetTimetableReport {
  readonly #deps: GetTimetableReportDependencies;
  readonly #reader: GridReader;
  constructor(deps: GetTimetableReportDependencies) {
    this.#deps = deps;
    this.#reader = new GridReader(deps);
  }
  async execute(
    actor: Actor,
    input: {
      id: string;
      revisionId: string;
      perspective: ReportPerspective;
      entityId?: string | undefined;
    },
  ) {
    requireRole(actor, READ_ROLES);
    const loaded = await this.#reader.load(input.id, input.revisionId);
    const { planning, revision, translated, placements, revisions } = loaded;
    const report = buildReportSheets({
      translated,
      snapshot: revision.snapshot,
      placements,
      perspective: input.perspective,
      entityId: input.entityId,
    });
    if (input.entityId && !report.targets.some((t) => t.id === input.entityId))
      throw new NotFoundError(
        'planning.report_target_not_found',
        'A turma ou o professor não faz parte desta revisão.',
      );
    const diagnosis = diagnoseGrid(translated, placements);
    const notices = [...diagnosis.model, ...diagnosis.problems, ...diagnosis.pending].map(
      (issue) => issue.message,
    );
    if (!isRevisionReviewed(revision)) notices.unshift(REVIEW_PENDING_NOTICE);
    if ((await this.#deps.plannings.find(planning.id))?.version !== planning.version)
      throw new StaleVersionError();
    return {
      planning: {
        id: planning.id,
        name: planning.name,
        year: planning.year,
        version: planning.version,
        archived: planning.archivedAt !== null,
      },
      revision: {
        id: revision.id,
        number: revision.number,
        name: revision.name,
        sealedAt: revision.sealedAt,
        capturedAt: revision.snapshot.capturedAt,
        catalogVersion: revision.snapshot.catalogVersion,
        historical: revisions.at(-1)?.id !== revision.id,
      },
      generatedAt: this.#deps.clock.now(),
      perspective: input.perspective,
      notices,
      ...report,
      revisions: revisions.map((r) => ({ id: r.id, number: r.number, name: r.name })),
    };
  }
}
