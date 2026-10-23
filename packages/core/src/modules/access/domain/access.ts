import { DomainError } from '../../../shared/domain-error.ts';

export type Role = 'admin' | 'editor' | 'viewer';
export interface Actor {
  id: string;
  username: string;
  role: Role;
}
export interface UserAccount extends Actor {
  disabled: boolean;
  version: number;
  createdAt: Date;
}
export const READ_ROLES: readonly Role[] = ['admin', 'editor', 'viewer'];
export const WRITE_ROLES: readonly Role[] = ['admin', 'editor'];
export const ADMIN_ROLES: readonly Role[] = ['admin'];

export class AccessError extends DomainError {
  readonly code: string;
  readonly kind: 'unauthorized' | 'forbidden' | 'validation' | 'conflict' | 'rate_limit';
  constructor(code: string, message: string, kind: AccessError['kind'] = 'forbidden') {
    super(message);
    this.code = code;
    this.kind = kind;
  }
}
export function requireRole(actor: Actor | null, roles: readonly Role[]): asserts actor is Actor {
  if (!actor)
    throw new AccessError(
      'access.session_required',
      'Entre novamente para continuar.',
      'unauthorized',
    );
  if (!roles.includes(actor.role))
    throw new AccessError('access.forbidden', 'Seu perfil não permite esta operação.');
}
export function validateCredentials(username: string, password: string): string {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]{3,39}$/.test(normalized)) {
    throw new AccessError(
      'access.username_invalid',
      'Use de 4 a 40 caracteres no usuário: letras sem acento, números, ponto, hífen ou sublinhado.',
      'validation',
    );
  }
  validatePassword(password);
  return normalized;
}
export function validatePassword(password: string): void {
  if (password.length < 15 || password.length > 128)
    throw new AccessError(
      'access.password_invalid',
      'A senha deve ter entre 15 e 128 caracteres.',
      'validation',
    );
}
export function validateAccountChange(
  actor: Actor,
  target: UserAccount,
  role: Role,
  disabled: boolean,
  activeAdmins: number,
): void {
  requireRole(actor, ADMIN_ROLES);
  if (actor.id === target.id && (disabled || role !== 'admin'))
    throw new AccessError(
      'access.self_change',
      'Peça a outro administrador para alterar seu próprio perfil ou desativar seu acesso.',
    );
  if (
    target.role === 'admin' &&
    !target.disabled &&
    (disabled || role !== 'admin') &&
    activeAdmins <= 1
  )
    throw new AccessError(
      'access.last_admin',
      'Mantenha pelo menos um administrador ativo.',
      'conflict',
    );
}
