import type { AuditReader, AuditCursor, AuditEntry } from '../ports/session-repository.ts';

export type ListAuditsDependencies = { audits: AuditReader };

export class ListAudits {
  readonly #deps: ListAuditsDependencies;
  constructor(deps: ListAuditsDependencies) {
    this.#deps = deps;
  }
  execute(before?: AuditCursor): Promise<AuditEntry[]> {
    return this.#deps.audits.list(before);
  }
}
