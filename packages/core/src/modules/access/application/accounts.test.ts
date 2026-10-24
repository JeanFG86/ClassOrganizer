import { describe, expect, it, vi } from 'vitest';
import { type AccountRepository, type StoredUser } from './usecases/accounts.ts';
import { createAccountTestOperations } from '../../../testing/use-case-operations.ts';
const user: StoredUser = {
  id: 'account-a',
  username: 'admin-test',
  role: 'admin',
  disabled: false,
  version: 2,
  createdAt: new Date(0),
  passwordHash: 'hash',
};
function fixture() {
  const repository: AccountRepository = {
    list: vi.fn(async () => [user]),
    find: vi.fn(async () => user),
    findUsername: vi.fn(async () => null),
    activeAdmins: vi.fn(async () => 2),
    add: vi.fn(),
    update: vi.fn(),
    revokeSessions: vi.fn(),
  };
  const passwords = { hash: vi.fn(async () => 'new-hash'), verify: vi.fn(async () => true) };
  return {
    repository,
    passwords,
    cases: createAccountTestOperations({
      repository,
      passwords,
      clock: { now: () => new Date(0) },
      ids: { next: () => 'new-id' },
    }),
  };
}
describe('gestão de acessos no core', () => {
  it('nega gestão por editor antes de consultar dados ou calcular senha', async () => {
    const { cases, repository, passwords } = fixture();
    await expect(
      cases.create(
        { ...user, role: 'editor' },
        { username: 'new-user', password: 'senha ficticia longa', role: 'admin' },
      ),
    ).rejects.toMatchObject({ code: 'access.forbidden' });
    expect(repository.findUsername).not.toHaveBeenCalled();
    expect(passwords.hash).not.toHaveBeenCalled();
  });
  it('cria acesso normalizado e devolve apenas os dados públicos', async () => {
    const { cases, repository } = fixture();
    const created = await cases.create(user, {
      username: ' NEW-USER ',
      password: 'senha ficticia longa',
      role: 'viewer',
    });
    expect(created).toMatchObject({ username: 'new-user', role: 'viewer', version: 1 });
    expect(created).not.toHaveProperty('passwordHash');
    expect(repository.add).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: 'new-hash' }),
    );
  });
  it('não modifica uma conta com versão antiga e revoga sessões ao alterar perfil', async () => {
    const { cases, repository } = fixture();
    const admin = { ...user, id: 'other-admin' };
    await expect(
      cases.change(admin, { id: user.id, version: 1, role: 'viewer', disabled: false }),
    ).rejects.toMatchObject({ code: 'concurrency.stale' });
    expect(repository.update).not.toHaveBeenCalled();
    await cases.change(admin, { id: user.id, version: 2, role: 'viewer', disabled: false });
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ version: 3, role: 'viewer' }),
      2,
    );
    expect(repository.revokeSessions).toHaveBeenCalledWith(user.id);
  });
  it('exige senha atual antes de derivar a nova senha', async () => {
    const { cases, passwords, repository } = fixture();
    passwords.verify.mockResolvedValue(false);
    await expect(
      cases.changePassword(user, { currentPassword: 'errada', password: 'senha ficticia longa' }),
    ).rejects.toMatchObject({ code: 'access.credentials_invalid' });
    expect(passwords.hash).not.toHaveBeenCalled();
    expect(repository.revokeSessions).not.toHaveBeenCalled();
  });
});
