import { AccessError } from '../../domain/access.ts';
import type { SessionRepository, SessionView } from '../ports/session-repository.ts';

export type SessionsDependencies = { sessions: SessionRepository };

export class GetSession {
  readonly #deps: SessionsDependencies;
  constructor(deps: SessionsDependencies) {
    this.#deps = deps;
  }
  async execute(tokenHash: string | null): Promise<SessionView> {
    const session = tokenHash ? await this.#deps.sessions.find(tokenHash) : null;
    if (!session)
      throw new AccessError(
        'access.session_required',
        'Entre novamente para continuar.',
        'unauthorized',
      );
    return session;
  }
}

export class Logout {
  readonly #deps: SessionsDependencies;
  constructor(deps: SessionsDependencies) {
    this.#deps = deps;
  }
  async execute(tokenHash: string | null): Promise<void> {
    if (tokenHash) await this.#deps.sessions.revoke(tokenHash);
  }
}
