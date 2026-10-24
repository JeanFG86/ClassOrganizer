import { describe, expect, it, vi } from 'vitest';
import { Login } from './login.ts';
import type { StoredUser } from '../ports/account-repository.ts';

const now = new Date('2026-02-01T12:00:00Z');
const user: StoredUser = {
  id: 'unit-user',
  username: 'unit-admin',
  role: 'admin',
  disabled: false,
  version: 3,
  createdAt: now,
  passwordHash: 'hash-ficticio',
};
function fixture() {
  const store = {
    recordAttempts: vi.fn(async () => {}),
    findUser: vi.fn(async (): Promise<StoredUser | null> => user),
    createSession: vi.fn(async () => {}),
  };
  const passwords = { hash: vi.fn(async () => 'hash'), verify: vi.fn(async () => true) };
  const login = new Login({
    store,
    passwords,
    tokens: { create: () => 'token-ficticio', hash: (value) => 'hash:' + value },
    clock: { now: () => now },
  });
  return { login, store, passwords };
}

describe('Login', () => {
  it('normaliza a conta, aplica limites e cria a sessão sem expor o hash da senha', async () => {
    const { login, store } = fixture();
    const result = await login.execute(' UNIT-ADMIN ', 'senha ficticia de teste', 'ip-ficticio');
    expect(store.findUser).toHaveBeenCalledWith('unit-admin');
    expect(store.recordAttempts).toHaveBeenCalledWith(
      [
        { key: 'hash:user:unit-admin', limit: 10 },
        { key: 'hash:ip:ip-ficticio', limit: 30 },
      ],
      now,
      new Date(now.getTime() + 15 * 60_000),
    );
    expect(store.createSession).toHaveBeenCalledWith({
      userId: user.id,
      expectedVersion: 3,
      tokenHash: 'hash:token-ficticio',
      now,
      expiresAt: new Date(now.getTime() + 8 * 60 * 60_000),
    });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('verifica um hash substituto quando a conta não existe e não cria sessão', async () => {
    const { login, store, passwords } = fixture();
    store.findUser.mockResolvedValue(null);
    await expect(
      login.execute('unit-missing', 'senha ficticia de teste', 'ip-ficticio'),
    ).rejects.toMatchObject({ code: 'access.credentials_invalid' });
    expect(passwords.verify).toHaveBeenCalledOnce();
    expect(store.createSession).not.toHaveBeenCalled();
  });

  it('limita verificações simultâneas e libera a capacidade ao terminar', async () => {
    const { login, passwords } = fixture();
    let release: (value: boolean) => void = () => {};
    const pending = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    passwords.verify.mockImplementation(() => pending);
    const first = login.execute('unit-admin', 'senha ficticia de teste', 'ip-ficticio');
    const second = login.execute('unit-admin', 'senha ficticia de teste', 'ip-ficticio');
    await expect(
      login.execute('unit-admin', 'senha ficticia de teste', 'ip-ficticio'),
    ).rejects.toMatchObject({ code: 'access.login_busy' });
    release(true);
    await Promise.all([first, second]);
    await expect(
      login.execute('unit-admin', 'senha ficticia de teste', 'ip-ficticio'),
    ).resolves.toHaveProperty('token');
  });
});
