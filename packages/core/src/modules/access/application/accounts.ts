import { StaleVersionError } from '../../../shared/versioning.ts';
import type { Clock, IdGenerator } from '../../../shared/ports.ts';
import {
  AccessError,
  ADMIN_ROLES,
  READ_ROLES,
  requireRole,
  validateAccountChange,
  validateCredentials,
  validatePassword,
  type Actor,
  type Role,
  type UserAccount,
} from '../domain/access.ts';

export interface StoredUser extends UserAccount {
  passwordHash: string;
}
export interface AccountRepository {
  list(): Promise<StoredUser[]>;
  find(id: string): Promise<StoredUser | null>;
  findUsername(username: string): Promise<StoredUser | null>;
  activeAdmins(): Promise<number>;
  add(user: StoredUser): Promise<void>;
  update(user: StoredUser, expectedVersion: number): Promise<void>;
  revokeSessions(userId: string): Promise<void>;
}
export interface PasswordService {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}
function publicAccount(user: StoredUser): UserAccount {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    disabled: user.disabled,
    version: user.version,
    createdAt: user.createdAt,
  };
}
export function makeManageAccounts(deps: {
  repository: AccountRepository;
  passwords: PasswordService;
  clock: Clock;
  ids: IdGenerator;
}) {
  const { repository, passwords, clock, ids } = deps;
  return {
    async list(actor: Actor) {
      requireRole(actor, ADMIN_ROLES);
      return (await repository.list()).map(publicAccount);
    },
    async create(actor: Actor, input: { username: string; password: string; role: Role }) {
      requireRole(actor, ADMIN_ROLES);
      const username = validateCredentials(input.username, input.password);
      if (await repository.findUsername(username))
        throw new AccessError('access.username_taken', 'Este usuário já existe.', 'conflict');
      const user: StoredUser = {
        id: ids.next(),
        username,
        passwordHash: await passwords.hash(input.password),
        role: input.role,
        disabled: false,
        version: 1,
        createdAt: clock.now(),
      };
      await repository.add(user);
      return publicAccount(user);
    },
    async change(
      actor: Actor,
      input: {
        id: string;
        version: number;
        role: Role;
        disabled: boolean;
        password?: string | undefined;
      },
    ) {
      requireRole(actor, ADMIN_ROLES);
      const user = await repository.find(input.id);
      if (!user || user.version !== input.version) throw new StaleVersionError();
      validateAccountChange(
        actor,
        user,
        input.role,
        input.disabled,
        await repository.activeAdmins(),
      );
      if (input.password !== undefined) validatePassword(input.password);
      const changed: StoredUser = {
        ...user,
        role: input.role,
        disabled: input.disabled,
        version: user.version + 1,
        ...(input.password !== undefined
          ? { passwordHash: await passwords.hash(input.password) }
          : {}),
      };
      await repository.update(changed, input.version);
      await repository.revokeSessions(user.id);
      return publicAccount(changed);
    },
    async changePassword(actor: Actor, input: { currentPassword: string; password: string }) {
      requireRole(actor, READ_ROLES);
      validatePassword(input.password);
      const user = await repository.find(actor.id);
      if (!user || !(await passwords.verify(input.currentPassword, user.passwordHash)))
        throw new AccessError(
          'access.credentials_invalid',
          'Usuário ou senha inválidos.',
          'unauthorized',
        );
      await repository.update(
        { ...user, passwordHash: await passwords.hash(input.password), version: user.version + 1 },
        user.version,
      );
      await repository.revokeSessions(user.id);
    },
  };
}
