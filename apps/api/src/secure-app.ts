import { AsyncLocalStorage } from 'node:async_hooks';
import {
  ADMIN_ROLES,
  READ_ROLES,
  WRITE_ROLES,
  AccessError,
  makeAuthorizedOperation,
  makeGenerationRuns,
  makePlannings,
  makeTimetableGrid,
} from '@classorganizer/core';
import type { GenerationSettings, Role } from '@classorganizer/core';
import {
  checkDatabase,
  createAccessUnitOfWork,
  hashToken,
  makeAccounts,
  makeLogin,
  PrismaGenerationRunRepository,
  PrismaGridRepository,
  PrismaPlanningRepository,
  publicUser,
  randomSeeds,
  sha256Digest,
  systemClock,
  uuidGenerator,
} from '@classorganizer/infrastructure';
import type { Database } from '@classorganizer/infrastructure';
import { z } from 'zod';
import {
  credentialsSchema,
  createUserSchema,
  changeUserSchema,
  changePasswordSchema,
  createPlanningSchema,
  changePlanningSchema,
  gridCommandSchema,
  gridQuerySchema,
  gridRulesChangeSchema,
  gridUndoSchema,
  generationCommandSchema,
  generationParamsSchema,
} from '@classorganizer/contracts';
import { buildApp, type AppOptions } from './app.ts';
import { makeCatalogServices } from './catalog-services.ts';
import { idParamsSchema, parseRequest } from './http/errors.ts';

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
  const generationSettings = options.generation ?? DEFAULT_GENERATION_SETTINGS;
  const context = new AsyncLocalStorage<{ sessionHash: string | null }>();
  const currentSession = () => context.getStore()?.sessionHash ?? null;
  const unitOfWork = createAccessUnitOfWork(db, (tx) => ({
    catalog: makeCatalogServices(tx),
    plannings: makePlannings({
      repository: new PrismaPlanningRepository(tx),
      grids: new PrismaGridRepository(tx),
      clock: systemClock,
      ids: uuidGenerator,
    }),
    grid: makeTimetableGrid({
      plannings: new PrismaPlanningRepository(tx),
      grids: new PrismaGridRepository(tx),
      clock: systemClock,
      ids: uuidGenerator,
    }),
    generation: makeGenerationRuns({
      plannings: new PrismaPlanningRepository(tx),
      grids: new PrismaGridRepository(tx),
      runs: new PrismaGenerationRunRepository(tx),
      clock: systemClock,
      ids: uuidGenerator,
      digest: sha256Digest,
      seeds: randomSeeds,
      settings: generationSettings,
    }),
    accounts: makeAccounts(tx),
    async session() {
      const session = await tx.loginSession.findUniqueOrThrow({
        where: { tokenHash: currentSession() ?? '' },
        include: { user: true },
      });
      return { user: publicUser(session.user), expiresAt: session.expiresAt };
    },
    async logout() {
      await tx.loginSession.deleteMany({ where: { tokenHash: currentSession() ?? '' } });
    },
    async audits(before?: { at: Date; id: string }) {
      return tx.auditEvent.findMany({
        where: before
          ? {
              OR: [
                { occurredAt: { lt: before.at } },
                { occurredAt: before.at, id: { lt: before.id } },
              ],
            }
          : {},
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 100,
        include: { actor: { select: { username: true } } },
      });
    },
  }));
  // Os tipos concretos do catálogo são preservados para os adaptadores HTTP existentes.
  function protect<Args extends unknown[], Result>(
    roles: readonly Role[],
    action: string | ((...args: Args) => string) | undefined,
    operation: (
      services: Parameters<Parameters<typeof unitOfWork.run>[2]>[0]['services'],
      actor: Parameters<Parameters<typeof unitOfWork.run>[2]>[0]['actor'],
      ...args: Args
    ) => Promise<Result>,
    catalog = false,
  ) {
    return makeAuthorizedOperation({
      currentSession,
      unitOfWork,
      roles,
      ...(action ? { action } : {}),
      catalog,
      operation,
      entityId: (...args: Args) => {
        const input = args[0];
        return typeof input === 'object' &&
          input !== null &&
          'id' in input &&
          typeof input.id === 'string'
          ? input.id
          : null;
      },
    });
  }
  const raw = makeCatalogServices(db);
  const catalog = { ...raw };
  function secureCatalog<Key extends keyof typeof raw>(key: Key): void {
    const write = !key.startsWith('list');
    // Cada chave e seus argumentos vêm exclusivamente da fábrica tipada do catálogo.
    const secured = protect(
      write ? WRITE_ROLES : READ_ROLES,
      write ? 'catalog.' + key : undefined,
      async (services, _actor, ...args: Parameters<(typeof raw)[Key]>) => {
        const operation = services.catalog[key] as (
          ...input: Parameters<(typeof raw)[Key]>
        ) => ReturnType<(typeof raw)[Key]>;
        return operation(...args);
      },
      write,
    );
    Object.assign(catalog, { [key]: secured });
  }
  for (const key of Object.keys(raw) as (keyof typeof raw)[]) secureCatalog(key);
  const login = makeLogin(db);
  const session = protect(READ_ROLES, undefined, (services) => services.session());
  const logout = protect(READ_ROLES, 'access.logout', (services) => services.logout());
  const listUsers = protect(ADMIN_ROLES, undefined, (services, actor) =>
    services.accounts.list(actor),
  );
  const createUser = protect(
    ADMIN_ROLES,
    'access.createUser',
    (services, actor, input: z.infer<typeof createUserSchema>) =>
      services.accounts.create(actor, input),
  );
  const changeUser = protect(
    ADMIN_ROLES,
    'access.changeUser',
    (services, actor, input: Parameters<ReturnType<typeof makeAccounts>['change']>[1]) =>
      services.accounts.change(actor, input),
  );
  const changePassword = protect(
    READ_ROLES,
    'access.changePassword',
    (services, actor, input: z.infer<typeof changePasswordSchema>) =>
      services.accounts.changePassword(actor, input),
  );
  const listPlannings = protect(READ_ROLES, undefined, (services, actor) =>
    services.plannings.list(actor),
  );
  const detailPlanning = protect(READ_ROLES, undefined, (services, actor, id: string) =>
    services.plannings.detail(actor, id),
  );
  const createPlanning = protect(
    WRITE_ROLES,
    (input: z.infer<typeof createPlanningSchema>) =>
      input.sourceId ? 'planning.copy' : 'planning.create',
    (services, actor, input: z.infer<typeof createPlanningSchema>) =>
      services.plannings.create(actor, input),
  );
  const changePlanning = protect(
    WRITE_ROLES,
    (input: z.infer<typeof changePlanningSchema> & { id: string }) => 'planning.' + input.operation,
    (services, actor, input: z.infer<typeof changePlanningSchema> & { id: string }) =>
      services.plannings.change(actor, input),
  );
  type GridCommand = z.infer<typeof gridCommandSchema> & { id: string };
  const viewGrid = protect(
    READ_ROLES,
    undefined,
    (services, actor, input: { id: string; revisionId?: string | undefined }) =>
      services.grid.view(actor, input),
  );
  // A prévia não grava nada: não bloqueia app_state nem gera auditoria.
  const previewGrid = protect(WRITE_ROLES, undefined, (services, actor, input: GridCommand) =>
    services.grid.preview(actor, input),
  );
  const applyGrid = protect(WRITE_ROLES, 'planning.grid', (services, actor, input: GridCommand) =>
    services.grid.apply(actor, input),
  );
  const undoGrid = protect(
    WRITE_ROLES,
    'planning.gridUndo',
    (services, actor, input: z.infer<typeof gridUndoSchema> & { id: string }) =>
      services.grid.undo(actor, input),
  );
  const changeGridRules = protect(
    WRITE_ROLES,
    'planning.gridRules',
    (services, actor, input: z.infer<typeof gridRulesChangeSchema> & { id: string }) =>
      services.grid.changeRules(actor, input),
  );
  type GenerationCommand = z.infer<typeof generationCommandSchema> & { id: string };
  const listGenerations = protect(
    READ_ROLES,
    undefined,
    (services, actor, input: { id: string; revisionId?: string | undefined }) =>
      services.generation.list(actor, input),
  );
  const detailGeneration = protect(
    READ_ROLES,
    undefined,
    (services, actor, input: z.infer<typeof generationParamsSchema>) =>
      services.generation.detail(actor, input),
  );
  const requestGeneration = protect(
    WRITE_ROLES,
    'planning.generationRequest',
    (services, actor, input: GenerationCommand) => services.generation.request(actor, input),
  );
  const cancelGeneration = protect(
    WRITE_ROLES,
    'planning.generationCancel',
    (services, actor, input: z.infer<typeof generationParamsSchema>) =>
      services.generation.cancel(actor, input),
  );
  const applyGeneration = protect(
    WRITE_ROLES,
    'planning.generationApply',
    (services, actor, input: GenerationCommand & { runId: string }) =>
      services.generation.apply(actor, input),
  );
  const listAudits = protect(
    ADMIN_ROLES,
    undefined,
    (services, _actor, before?: { at: Date; id: string }) => services.audits(before),
  );
  const cookie = (token: string, maxAge: number) =>
    'entreaulas_session=' +
    token +
    '; Path=/api; HttpOnly; SameSite=Strict; Max-Age=' +
    maxAge +
    (options.origin.startsWith('https://') ? '; Secure' : '');
  return buildApp(
    { ...catalog, checkReadiness: () => checkDatabase(db) },
    {
      logger: options.logger,
      configure(app) {
        app.addHook('onRequest', (request, reply, done) => {
          reply.header('cache-control', 'no-store');
          const token = request.headers.cookie
            ?.split(';')
            .map((part) => part.trim())
            .find((part) => part.startsWith('entreaulas_session='))
            ?.slice('entreaulas_session='.length);
          context.run(
            { sessionHash: token && /^[\w-]{43}$/.test(token) ? hashToken(token) : null },
            done,
          );
        });
        app.addHook('preHandler', async (request) => {
          if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
          if (
            request.headers['x-entreaulas-client'] !== 'web' ||
            (request.headers.origin !== undefined && request.headers.origin !== options.origin) ||
            request.headers['sec-fetch-site'] === 'cross-site'
          )
            throw new AccessError(
              'access.origin_invalid',
              'Abra a aplicação no endereço configurado para continuar.',
            );
        });
        app.post('/api/v1/auth/login', async (request, reply) => {
          const input = parseRequest(credentialsSchema, request.body);
          const result = await login(input.username, input.password, request.ip);
          reply.header('set-cookie', cookie(result.token, 8 * 60 * 60));
          return { user: result.user, expiresAt: result.expiresAt };
        });
        app.get('/api/v1/auth/session', () => session());
        app.post('/api/v1/auth/logout', async (_request, reply) => {
          await logout();
          reply.header('set-cookie', cookie('', 0));
          return reply.code(204).send();
        });
        app.post('/api/v1/auth/password', async (request, reply) => {
          const input = parseRequest(changePasswordSchema, request.body);
          await changePassword(input);
          reply.header('set-cookie', cookie('', 0));
          return reply.code(204).send();
        });
        app.get('/api/v1/users', () => listUsers());
        app.post('/api/v1/users', async (request, reply) => {
          const input = parseRequest(createUserSchema, request.body);
          return reply.code(201).send(await createUser(input));
        });
        app.put('/api/v1/users/:id', async (request) => {
          const { id } = parseRequest(idParamsSchema, request.params);
          const input = parseRequest(changeUserSchema, request.body);
          return changeUser({ id, ...input });
        });
        app.get('/api/v1/plannings', () => listPlannings());
        app.post('/api/v1/plannings', async (request, reply) =>
          reply
            .code(201)
            .send(await createPlanning(parseRequest(createPlanningSchema, request.body))),
        );
        app.get('/api/v1/plannings/:id', (request) =>
          detailPlanning(parseRequest(idParamsSchema, request.params).id),
        );
        app.put('/api/v1/plannings/:id', (request) =>
          changePlanning({
            ...parseRequest(changePlanningSchema, request.body),
            ...parseRequest(idParamsSchema, request.params),
          }),
        );
        app.get('/api/v1/plannings/:id/grid', (request) =>
          viewGrid({
            ...parseRequest(gridQuerySchema, request.query),
            ...parseRequest(idParamsSchema, request.params),
          }),
        );
        app.post('/api/v1/plannings/:id/grid/preview', (request) =>
          previewGrid({
            ...parseRequest(gridCommandSchema, request.body),
            ...parseRequest(idParamsSchema, request.params),
          }),
        );
        app.post('/api/v1/plannings/:id/grid/operations', (request) =>
          applyGrid({
            ...parseRequest(gridCommandSchema, request.body),
            ...parseRequest(idParamsSchema, request.params),
          }),
        );
        app.post('/api/v1/plannings/:id/grid/undo', (request) =>
          undoGrid({
            ...parseRequest(gridUndoSchema, request.body),
            ...parseRequest(idParamsSchema, request.params),
          }),
        );
        app.put('/api/v1/plannings/:id/grid/rules', (request) =>
          changeGridRules({
            ...parseRequest(gridRulesChangeSchema, request.body),
            ...parseRequest(idParamsSchema, request.params),
          }),
        );
        app.get('/api/v1/plannings/:id/generations', (request) =>
          listGenerations({
            ...parseRequest(gridQuerySchema, request.query),
            ...parseRequest(idParamsSchema, request.params),
          }),
        );
        app.post('/api/v1/plannings/:id/generations', async (request, reply) =>
          reply.code(201).send(
            await requestGeneration({
              ...parseRequest(generationCommandSchema, request.body),
              ...parseRequest(idParamsSchema, request.params),
            }),
          ),
        );
        app.get('/api/v1/plannings/:id/generations/:runId', (request) =>
          detailGeneration(parseRequest(generationParamsSchema, request.params)),
        );
        app.post('/api/v1/plannings/:id/generations/:runId/cancel', (request) =>
          cancelGeneration(parseRequest(generationParamsSchema, request.params)),
        );
        app.post('/api/v1/plannings/:id/generations/:runId/apply', (request) =>
          applyGeneration({
            ...parseRequest(generationCommandSchema, request.body),
            ...parseRequest(generationParamsSchema, request.params),
          }),
        );
        app.get('/api/v1/audit', (request) => {
          const query = parseRequest(
            z
              .object({ before: z.iso.datetime().optional(), beforeId: z.uuid().optional() })
              .refine((value) => (value.before === undefined) === (value.beforeId === undefined), {
                message: 'Informe o cursor completo.',
              }),
            request.query,
          );
          return listAudits(
            query.before && query.beforeId
              ? { at: new Date(query.before), id: query.beforeId }
              : undefined,
          );
        });
      },
    },
  );
}
