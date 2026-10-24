import type { AuditReader } from '@classorganizer/core';
export interface AuditOperations {
  listAudits: AuditReader['list'];
}
export class AuditController {
  readonly #operations: AuditOperations;
  constructor(operations: AuditOperations) {
    this.#operations = operations;
  }
  listAudits(...args: Parameters<AuditOperations['listAudits']>) {
    return this.#operations.listAudits(...args);
  }
}
