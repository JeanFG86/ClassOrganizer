import type { GenerationSettings } from '@classorganizer/core';
import { checkDatabase, hashToken, type Database } from '@classorganizer/infrastructure';
import { buildApp, type AppOptions } from './app.ts';
import { composeOperations } from './composition/operations.ts';
import { SessionContext, registerSecurityHooks } from './http/security.ts';
import { registerAccessRoutes } from './http/access-routes.ts';
import { registerPlanningRoutes } from './http/planning-routes.ts';
import { registerGridRoutes } from './http/grid-routes.ts';
import { registerGenerationRoutes } from './http/generation-routes.ts';
import { registerAuditRoutes } from './http/audit-routes.ts';
/** Metas provisórias da busca, enquanto não houver metas pactuadas (ADR 0014). */
export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  timeLimitMs: 30_000,
  nodeLimit: 2_000_000,
  memoryLimitMb: 256,
};
export function createSecureApp(
  db: Database,
  options: { logger: AppOptions['logger']; origin: string; generation?: GenerationSettings },
) {
  const context = new SessionContext(hashToken);
  const operations = composeOperations(db, options.generation ?? DEFAULT_GENERATION_SETTINGS, () =>
    context.current(),
  );
  return buildApp(
    { ...operations.catalog, checkReadiness: () => checkDatabase(db) },
    {
      logger: options.logger,
      configure(app) {
        registerSecurityHooks(app, context, options.origin);
        registerAccessRoutes(app, operations, options.origin);
        registerPlanningRoutes(app, operations);
        registerGridRoutes(app, operations);
        registerGenerationRoutes(app, operations);
        registerAuditRoutes(app, operations);
      },
    },
  );
}
