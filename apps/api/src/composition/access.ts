import { GetSession, Logout, ListAudits } from '@classorganizer/core';
import {
  makeAccounts,
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
    accounts: makeAccounts(tx),
    session: () => getSession.execute(currentSession()),
    logout: () => logout.execute(currentSession()),
    audits: audits.execute.bind(audits),
  };
}
