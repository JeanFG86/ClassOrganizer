import type { UserAccount } from '../../domain/access.ts';

export interface SessionView {
  user: UserAccount;
  expiresAt: Date;
}
export interface SessionRepository {
  find(tokenHash: string): Promise<SessionView | null>;
  revoke(tokenHash: string): Promise<void>;
}
export interface AuditCursor {
  at: Date;
  id: string;
}
export interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  entityId: string | null;
  occurredAt: Date;
  actor: { username: string };
}
export interface AuditReader {
  list(before?: AuditCursor): Promise<AuditEntry[]>;
}
export interface LoginResult {
  token: string;
  user: UserAccount;
  expiresAt: Date;
}
