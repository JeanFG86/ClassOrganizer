import type { Clock } from '../../../../shared/ports.ts';
import { StaleVersionError } from '../../../../shared/versioning.ts';
import { READ_ROLES, requireRole, type Actor } from '../../../access/domain/index.ts';
import { buildTimetableExport } from '../../domain/timetable-export.ts';
import type { TimetableWorkbookWriter } from '../ports/index.ts';
import { GridReader, type GridReaderDependencies } from '../services/grid-access.ts';

export type ExportTimetableWorkbookDependencies = GridReaderDependencies & {
  clock: Clock;
  workbooks: TimetableWorkbookWriter;
};
export class ExportTimetableWorkbook {
  readonly #deps: ExportTimetableWorkbookDependencies;
  readonly #reader: GridReader;
  constructor(deps: ExportTimetableWorkbookDependencies) {
    this.#deps = deps;
    this.#reader = new GridReader(deps);
  }
  async execute(actor: Actor, input: { id: string; revisionId: string; version: number }) {
    requireRole(actor, READ_ROLES);
    const loaded = await this.#reader.load(input.id, input.revisionId, input.version);
    const data = buildTimetableExport({
      ...loaded,
      historical: loaded.revisions.at(-1)?.id !== loaded.revision.id,
      generatedAt: this.#deps.clock.now(),
    });
    if ((await this.#deps.plannings.find(input.id))?.version !== input.version)
      throw new StaleVersionError();
    return {
      content: await this.#deps.workbooks.write(data),
      fileName: `entreaulas-${data.planning.year}-${data.planning.id.slice(0, 8)}-revisao-${data.revision.number}-v${input.version}.xlsx`,
    };
  }
}
