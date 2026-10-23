import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_ROLES,
  READ_ROLES,
  WRITE_ROLES,
  requireRole,
  validateAccountChange,
  validateCredentials,
  type Actor,
} from '../domain/access.ts';
import { makeAuthorizedOperation, type AuthorizedScope } from './authorize.ts';
const admin: Actor = { id: 'admin', username: 'admin-test', role: 'admin' };
describe('autorização na aplicação', () => {
  it.each(['admin', 'editor', 'viewer'] as const)('permite leitura para %s', (role) => {
    expect(() => requireRole({ ...admin, role }, READ_ROLES)).not.toThrow();
  });
  it('nega sessão ausente e diferencia permissão insuficiente', () => {
    expect(() => requireRole(null, READ_ROLES)).toThrow(
      expect.objectContaining({ kind: 'unauthorized' }),
    );
    expect(() => requireRole({ ...admin, role: 'viewer' }, WRITE_ROLES)).toThrow(
      expect.objectContaining({ kind: 'forbidden' }),
    );
    expect(() => requireRole({ ...admin, role: 'editor' }, ADMIN_ROLES)).toThrow(
      expect.objectContaining({ kind: 'forbidden' }),
    );
  });
  it('impede escrita e auditoria antes de invocar o caso de uso', async () => {
    const operation = vi.fn();
    const audit = vi.fn();
    const catalogChanged = vi.fn();
    const secured = makeAuthorizedOperation({
      currentSession: () => 'session',
      roles: WRITE_ROLES,
      action: 'write',
      operation,
      unitOfWork: {
        run: async (_session, _write, run) =>
          run({ actor: { ...admin, role: 'viewer' }, services: {}, audit, catalogChanged }),
      },
    });
    await expect(secured()).rejects.toMatchObject({ code: 'access.forbidden' });
    expect(operation).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(catalogChanged).not.toHaveBeenCalled();
  });
  it('só registra uma alteração que terminou com sucesso, dentro da unidade de trabalho', async () => {
    const events: string[] = [];
    const scope: AuthorizedScope<object> = {
      actor: admin,
      services: {},
      audit: async (action, id) => {
        events.push(action + ':' + id);
      },
      catalogChanged: async () => {
        events.push('version');
      },
    };
    const secured = makeAuthorizedOperation({
      currentSession: () => 'session',
      roles: WRITE_ROLES,
      action: 'create',
      catalog: true,
      operation: async () => {
        events.push('operation');
        return { id: 'created' };
      },
      unitOfWork: {
        run: async (_session, write, run) => {
          expect(write).toBe(true);
          return run(scope);
        },
      },
    });
    await secured();
    expect(events).toEqual(['operation', 'version', 'create:created']);
  });
  it('não permite remover o último administrador ou alterar o próprio perfil', () => {
    const target = { ...admin, id: 'other', disabled: false, version: 1, createdAt: new Date() };
    expect(() => validateAccountChange(admin, target, 'viewer', false, 1)).toThrow(
      expect.objectContaining({ code: 'access.last_admin' }),
    );
    expect(() =>
      validateAccountChange(admin, { ...target, id: admin.id }, 'admin', true, 2),
    ).toThrow(expect.objectContaining({ code: 'access.self_change' }));
  });
  it('normaliza usuário sem modificar a senha e rejeita credenciais curtas', () => {
    expect(validateCredentials(' ADMIN-Test ', ' senha longa 123 ')).toBe('admin-test');
    expect(() => validateCredentials('inválido', 'uma senha longa')).toThrow();
    expect(() => validateCredentials('valid-user', 'curta')).toThrow();
  });
});
