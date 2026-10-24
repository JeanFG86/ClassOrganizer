import type { GenerationSettings, Role } from '@classorganizer/core';
import {
  createAccessUnitOfWork,
  makeLogin,
  PrismaGenerationRunRepository,
  PrismaGridRepository,
  PrismaPlanningRepository,
  randomSeeds,
  sha256Digest,
  systemClock,
  uuidGenerator,
} from '@classorganizer/infrastructure';
import type { Database, makeAccounts } from '@classorganizer/infrastructure';
import {
  ADMIN_ROLES,
  READ_ROLES,
  WRITE_ROLES,
  makeAuthorizedOperation,
  makeGenerationRuns,
  makePlannings,
  makeTimetableGrid,
} from '@classorganizer/core';

import { makeCatalogServices } from '../catalog-services.ts';

import { composeAccessServices } from './access.ts';
export function composeOperations(
  db: Database,
  generationSettings: GenerationSettings,
  currentSession: () => string | null,
) {
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
    ...composeAccessServices(tx, currentSession),
  }));
  type Services = Parameters<Parameters<typeof unitOfWork.run>[2]>[0]['services'];
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
    (services, actor, input: Parameters<Services['accounts']['create']>[1]) =>
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
    (services, actor, input: Parameters<Services['accounts']['changePassword']>[1]) =>
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
    (input: Parameters<Services['plannings']['create']>[1]) =>
      input.sourceId ? 'planning.copy' : 'planning.create',
    (services, actor, input: Parameters<Services['plannings']['create']>[1]) =>
      services.plannings.create(actor, input),
  );
  const changePlanning = protect(
    WRITE_ROLES,
    (input: Parameters<Services['plannings']['change']>[1] & { id: string }) =>
      'planning.' + input.operation,
    (services, actor, input: Parameters<Services['plannings']['change']>[1] & { id: string }) =>
      services.plannings.change(actor, input),
  );
  type GridCommand = Parameters<Services['grid']['apply']>[1] & { id: string };
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
    (services, actor, input: Parameters<Services['grid']['undo']>[1] & { id: string }) =>
      services.grid.undo(actor, input),
  );
  const changeGridRules = protect(
    WRITE_ROLES,
    'planning.gridRules',
    (services, actor, input: Parameters<Services['grid']['changeRules']>[1] & { id: string }) =>
      services.grid.changeRules(actor, input),
  );
  type GenerationCommand = Parameters<Services['generation']['apply']>[1] & { id: string };
  const listGenerations = protect(
    READ_ROLES,
    undefined,
    (services, actor, input: { id: string; revisionId?: string | undefined }) =>
      services.generation.list(actor, input),
  );
  const detailGeneration = protect(
    READ_ROLES,
    undefined,
    (services, actor, input: Parameters<Services['generation']['detail']>[1]) =>
      services.generation.detail(actor, input),
  );
  const requestGeneration = protect(
    WRITE_ROLES,
    'planning.generationRequest',
    (services, actor, input: Parameters<Services['generation']['request']>[1] & { id: string }) =>
      services.generation.request(actor, input),
  );
  const cancelGeneration = protect(
    WRITE_ROLES,
    'planning.generationCancel',
    (services, actor, input: Parameters<Services['generation']['detail']>[1]) =>
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
  return {
    catalog,
    login,
    session,
    logout,
    listUsers,
    createUser,
    changeUser,
    changePassword,
    listPlannings,
    detailPlanning,
    createPlanning,
    changePlanning,
    viewGrid,
    previewGrid,
    applyGrid,
    undoGrid,
    changeGridRules,
    listGenerations,
    detailGeneration,
    requestGeneration,
    cancelGeneration,
    applyGeneration,
    listAudits,
  };
}
