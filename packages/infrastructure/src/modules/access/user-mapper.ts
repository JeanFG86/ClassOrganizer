import { AccessError, type UserAccount } from '@classorganizer/core';
import type { AppUser } from '../../generated/prisma/client.ts';
export function publicUser(user: AppUser): UserAccount {
  const { id, username, role, disabled, version, createdAt } = user;
  if (role !== 'admin' && role !== 'editor' && role !== 'viewer')
    throw new AccessError('access.role_invalid', 'Perfil de acesso inválido.');
  return { id, username, role, disabled, version, createdAt };
}
