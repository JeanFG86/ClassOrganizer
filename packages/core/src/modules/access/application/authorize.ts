import { requireRole, type Actor, type Role } from '../domain/access.ts';

export interface AuthorizedScope<Services> {
  actor: Actor;
  services: Services;
  audit(action: string, entityId: string | null): Promise<void>;
  catalogChanged(): Promise<void>;
}
export interface AccessUnitOfWork<Services> {
  run<T>(
    sessionHash: string | null,
    write: boolean,
    operation: (scope: AuthorizedScope<Services>) => Promise<T>,
  ): Promise<T>;
}
/** Toda entrada da aplicação usa esta fronteira: autorização, alteração e auditoria atômicas. */
export function makeAuthorizedOperation<Args extends unknown[], Result, Services>(deps: {
  currentSession(): string | null;
  unitOfWork: AccessUnitOfWork<Services>;
  roles: readonly Role[];
  action?: string | ((...args: Args) => string);
  catalog?: boolean;
  entityId?: (...args: Args) => string | null;
  operation(services: Services, actor: Actor, ...args: Args): Promise<Result>;
}) {
  return async (...args: Args): Promise<Result> =>
    deps.unitOfWork.run(deps.currentSession(), deps.action !== undefined, async (scope) => {
      requireRole(scope.actor, deps.roles);
      const result = await deps.operation(scope.services, scope.actor, ...args);
      if (deps.action) {
        if (deps.catalog) await scope.catalogChanged();
        const returnedId =
          typeof result === 'object' &&
          result !== null &&
          'id' in result &&
          typeof result.id === 'string'
            ? result.id
            : null;
        await scope.audit(
          typeof deps.action === 'function' ? deps.action(...args) : deps.action,
          deps.entityId?.(...args) ?? returnedId,
        );
      }
      return result;
    });
}
