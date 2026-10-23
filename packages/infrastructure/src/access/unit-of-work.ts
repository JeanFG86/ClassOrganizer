import { AccessError, type AccessUnitOfWork, type Actor } from '@classorganizer/core';
import type { Database } from '../persistence/database.ts';
import type { Prisma } from '../generated/prisma/client.ts';
import { systemClock, uuidGenerator } from '../system/system-ports.ts';

export async function lockApp(tx: Prisma.TransactionClient): Promise<void> {
  const locked =
    await tx.$executeRaw`UPDATE app_state SET catalog_version = catalog_version WHERE id = 1`;
  if (locked !== 1) throw new Error('Estado transacional da aplicação ausente.');
}
export async function sessionActor(
  tx: Prisma.TransactionClient,
  tokenHash: string | null,
): Promise<Actor> {
  const session = tokenHash
    ? await tx.loginSession.findUnique({ where: { tokenHash }, include: { user: true } })
    : null;
  if (!session || session.expiresAt <= systemClock.now() || session.user.disabled)
    throw new AccessError(
      'access.session_required',
      'Entre novamente para continuar.',
      'unauthorized',
    );
  const { id, username, role } = session.user;
  if (role !== 'admin' && role !== 'editor' && role !== 'viewer')
    throw new AccessError('access.role_invalid', 'Perfil de acesso inválido.');
  return { id, username, role };
}
export async function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  entityId: string | null,
): Promise<void> {
  await tx.auditEvent.create({
    data: { id: uuidGenerator.next(), actorId, action, entityId, occurredAt: systemClock.now() },
  });
}
export function createAccessUnitOfWork<Services>(
  db: Database,
  factory: (tx: Prisma.TransactionClient) => Services,
): AccessUnitOfWork<Services> {
  return {
    async run(tokenHash, write, operation) {
      return db.$transaction(
        async (tx) => {
          if (write) await lockApp(tx);
          const actor = await sessionActor(tx, tokenHash);
          return operation({
            actor,
            services: factory(tx),
            audit: (action, entityId) => audit(tx, actor.id, action, entityId),
            catalogChanged: async () => {
              await tx.appState.update({
                where: { id: 1 },
                data: { catalogVersion: { increment: 1 } },
              });
            },
          });
        },
        { timeout: 15000 },
      );
    },
  };
}
