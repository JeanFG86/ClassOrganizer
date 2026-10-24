import type { InjectionKey } from 'vue';
import type { AuditApi } from '../application/audit-api.ts';
export const auditApiKey: InjectionKey<AuditApi> = Symbol('AuditApi');
