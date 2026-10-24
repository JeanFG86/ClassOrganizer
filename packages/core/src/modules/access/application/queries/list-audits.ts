import type { AuditReader, AuditCursor, AuditEntry } from '../ports/session-repository.ts';

export class ListAudits {
  readonly #reader: AuditReader;
  constructor(reader: AuditReader) {
    this.#reader = reader;
  }
  execute(before?: AuditCursor): Promise<AuditEntry[]> {
    return this.#reader.list(before);
  }
}
