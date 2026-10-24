import {
  ChangeAccount,
  ChangePassword,
  CreateAccount,
  GetSession,
  ListAccounts,
  ListAudits,
  Login,
  Logout,
  bindUseCase,
} from '@classorganizer/core';
import {
  PrismaAccountRepository,
  PrismaAuditReader,
  PrismaLoginStore,
  PrismaSessionRepository,
  hashPassword,
  hashToken,
  newToken,
  systemClock,
  uuidGenerator,
  verifyPassword,
  type Database,
  type PersistenceClient,
} from '@classorganizer/infrastructure';

const passwords = { hash: hashPassword, verify: verifyPassword };

/** Contas, sessão atual e auditoria de uma transação. */
export function composeAccess(tx: PersistenceClient, currentSession: () => string | null) {
  const accounts = {
    repository: new PrismaAccountRepository(tx),
    passwords,
    clock: systemClock,
    ids: uuidGenerator,
  };
  const sessions = new PrismaSessionRepository(tx);
  const getSession = new GetSession({ sessions });
  const logout = new Logout({ sessions });
  return {
    accounts: {
      list: bindUseCase(new ListAccounts(accounts)),
      create: bindUseCase(new CreateAccount(accounts)),
      change: bindUseCase(new ChangeAccount(accounts)),
      changePassword: bindUseCase(new ChangePassword(accounts)),
    },
    session: () => getSession.execute(currentSession()),
    logout: () => logout.execute(currentSession()),
    audits: bindUseCase(new ListAudits({ audits: new PrismaAuditReader(tx) })),
  };
}

/** O login acontece antes de haver sessão, fora da fronteira autorizada. */
export function composeLogin(db: Database) {
  return bindUseCase(
    new Login({
      store: new PrismaLoginStore(db),
      passwords,
      tokens: { create: newToken, hash: hashToken },
      clock: systemClock,
    }),
  );
}
