import { AccessError } from '../../domain/access.ts';
import type { SessionRepository, SessionView } from '../ports/session-repository.ts';

export class GetSession {
  readonly #sessions: SessionRepository;
  constructor(sessions: SessionRepository) {
    this.#sessions = sessions;
  }
  async execute(tokenHash: string | null): Promise<SessionView> {
    const session = tokenHash ? await this.#sessions.find(tokenHash) : null;
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
  readonly #sessions: SessionRepository;
  constructor(sessions: SessionRepository) {
    this.#sessions = sessions;
  }
  async execute(tokenHash: string | null): Promise<void> {
    if (tokenHash) await this.#sessions.revoke(tokenHash);
  }
}
