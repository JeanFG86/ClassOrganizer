import { Login, bindUseCase } from '@classorganizer/core';
import {
  PrismaAccountRepository,
  PrismaLoginStore,
  hashPassword,
  verifyPassword,
  newToken,
  hashToken,
  systemClock,
  uuidGenerator,
  type Database,
} from '@classorganizer/infrastructure';
import { composeManageAccounts } from './account-operations.ts';
import { GetSession, Logout, ListAudits } from '@classorganizer/core';
import {
  PrismaSessionRepository,
  PrismaAuditReader,
  type PersistenceClient,
} from '@classorganizer/infrastructure';

export function composeAccessServices(tx: PersistenceClient, currentSession: () => string | null) {
  const sessions = new PrismaSessionRepository(tx);
  const getSession = new GetSession(sessions);
  const logout = new Logout(sessions);
  const audits = new ListAudits(new PrismaAuditReader(tx));
  return {
    accounts: composeManageAccounts({
      repository: new PrismaAccountRepository(tx),
      passwords: { hash: hashPassword, verify: verifyPassword },
      clock: systemClock,
      ids: uuidGenerator,
    }),
    session: () => getSession.execute(currentSession()),
    logout: () => logout.execute(currentSession()),
    audits: audits.execute.bind(audits),
  };
}

export function composeLogin(db: Database) {
  return bindUseCase(
    new Login({
      store: new PrismaLoginStore(db),
      passwords: { hash: hashPassword, verify: verifyPassword },
      tokens: { create: newToken, hash: hashToken },
      clock: systemClock,
    }),
  );
}
