import {
  ADMIN_ROLES,
  READ_ROLES,
  WRITE_ROLES,
  makeAuthorizedOperation,
  type Actor,
  type GenerationSettings,
  type Role,
} from '@classorganizer/core';
import {
  createAccessUnitOfWork,
  type Database,
  type PersistenceClient,
} from '@classorganizer/infrastructure';
import { composeAccess, composeLogin } from './access.ts';
import { CATALOG_ACCESS, composeCatalog, type CatalogServices } from './catalog.ts';
import { composeCatalogImport } from './catalog-import.ts';
import { composePlanning } from './planning.ts';

/** Serviços disponíveis dentro de uma transação autorizada. */
function composeTransaction(
  tx: PersistenceClient,
  settings: GenerationSettings,
  currentSession: () => string | null,
) {
  return {
    catalog: composeCatalog(tx),
    catalogImport: composeCatalogImport(tx),
    ...composePlanning(tx, settings),
    ...composeAccess(tx, currentSession),
  };
}
type Services = ReturnType<typeof composeTransaction>;
type Input<Operation extends (actor: Actor, input: never) => unknown> = Parameters<Operation>[1];

/** O identificador auditado é o `id` da entrada ou, na falta dele, o do resultado. */
function inputId(...args: unknown[]): string | null {
  const [input] = args;
  return typeof input === 'object' &&
    input !== null &&
    'id' in input &&
    typeof input.id === 'string'
    ? input.id
    : null;
}

export function composeOperations(
  db: Database,
  generationSettings: GenerationSettings,
  currentSession: () => string | null,
) {
  const unitOfWork = createAccessUnitOfWork(db, (tx) =>
    composeTransaction(tx, generationSettings, currentSession),
  );

  /** Sem `action`, a operação é leitura: não bloqueia `app_state` nem gera auditoria. */
  function protect<Args extends unknown[], Result>(
    roles: readonly Role[],
    action: string | ((...args: Args) => string) | undefined,
    operation: (services: Services, actor: Actor, ...args: Args) => Promise<Result>,
    catalog = false,
  ) {
    return makeAuthorizedOperation({
      currentSession,
      unitOfWork,
      roles,
      ...(action ? { action } : {}),
      catalog,
      operation,
      entityId: inputId,
    });
  }

  function protectCatalog<Key extends keyof CatalogServices>(key: Key) {
    type Operation = (
      ...args: Parameters<CatalogServices[Key]>
    ) => ReturnType<CatalogServices[Key]>;
    const write = CATALOG_ACCESS[key] === 'write';
    return protect(
      write ? WRITE_ROLES : READ_ROLES,
      write ? 'catalog.' + key : undefined,
      async (services, _actor, ...args: Parameters<CatalogServices[Key]>) =>
        (services.catalog[key] as Operation)(...args),
      write,
    );
  }
  const secured: Partial<Record<keyof CatalogServices, unknown>> = {};
  for (const key of Object.keys(CATALOG_ACCESS) as (keyof CatalogServices)[])
    secured[key] = protectCatalog(key);
  // Cada chave mantém a assinatura do caso de uso composto em `composeCatalog`.
  const catalog = secured as CatalogServices;

  type GridCommand = Input<Services['grid']['apply']> & { id: string };
  type GenerationCommand = Input<Services['generation']['apply']> & { id: string };
  type ChangePlanningInput = Input<Services['plannings']['change']> & { id: string };

  type CatalogImports = Services['catalogImport'];
  type CatalogImportInput = Parameters<CatalogImports['apply']>[0];

  return {
    catalog,
    catalogImportTemplate: protect(
      READ_ROLES,
      undefined,
      async (services, _actor, input: Parameters<CatalogImports['template']>[0]) =>
        services.catalogImport.template(input),
    ),
    // A prévia não grava nada: não bloqueia app_state nem gera auditoria.
    previewCatalogImport: protect(
      WRITE_ROLES,
      undefined,
      (services, _actor, input: Parameters<CatalogImports['preview']>[0]) =>
        services.catalogImport.preview(input),
    ),
    // Grava todas as linhas ou nenhuma, avança a versão do catálogo e audita o tipo importado.
    importCatalog: protect(
      WRITE_ROLES,
      (input: CatalogImportInput) => 'catalog.import.' + input.kind,
      (services, _actor, input: CatalogImportInput) => services.catalogImport.apply(input),
      true,
    ),
    timetableWorkbook: protect(
      READ_ROLES,
      undefined,
      (services, actor, input: Input<Services['plannings']['workbook']>) =>
        services.plannings.workbook(actor, input),
    ),
    timetableReport: protect(
      READ_ROLES,
      undefined,
      (services, actor, input: Input<Services['plannings']['report']>) =>
        services.plannings.report(actor, input),
    ),
    preserveRevision: protect(
      WRITE_ROLES,
      'planning.revisionPreserve',
      (services, actor, input: Input<Services['plannings']['preserveRevision']>) =>
        services.plannings.preserveRevision(actor, input),
    ),
    login: composeLogin(db),
    session: protect(READ_ROLES, undefined, (services) => services.session()),
    logout: protect(READ_ROLES, 'access.logout', (services) => services.logout()),
    listUsers: protect(ADMIN_ROLES, undefined, (services, actor) => services.accounts.list(actor)),
    createUser: protect(
      ADMIN_ROLES,
      'access.createUser',
      (services, actor, input: Input<Services['accounts']['create']>) =>
        services.accounts.create(actor, input),
    ),
    changeUser: protect(
      ADMIN_ROLES,
      'access.changeUser',
      (services, actor, input: Input<Services['accounts']['change']>) =>
        services.accounts.change(actor, input),
    ),
    changePassword: protect(
      READ_ROLES,
      'access.changePassword',
      (services, actor, input: Input<Services['accounts']['changePassword']>) =>
        services.accounts.changePassword(actor, input),
    ),
    listPlannings: protect(READ_ROLES, undefined, (services, actor) =>
      services.plannings.list(actor),
    ),
    detailPlanning: protect(READ_ROLES, undefined, (services, actor, id: string) =>
      services.plannings.detail(actor, id),
    ),
    compareRevisions: protect(
      READ_ROLES,
      undefined,
      (services, actor, input: Input<Services['plannings']['compareRevisions']>) =>
        services.plannings.compareRevisions(actor, input),
    ),
    revisionChecklist: protect(
      READ_ROLES,
      undefined,
      (services, actor, input: Input<Services['plannings']['revisionChecklist']>) =>
        services.plannings.revisionChecklist(actor, input),
    ),
    renameRevision: protect(
      WRITE_ROLES,
      'planning.revisionName',
      (services, actor, input: Input<Services['plannings']['renameRevision']>) =>
        services.plannings.renameRevision(actor, input),
    ),
    restoreRevision: protect(
      WRITE_ROLES,
      'planning.revisionRestore',
      (services, actor, input: Input<Services['plannings']['restoreRevision']>) =>
        services.plannings.restoreRevision(actor, input),
    ),
    createPlanning: protect(
      WRITE_ROLES,
      (input: Input<Services['plannings']['create']>) =>
        input.sourceId ? 'planning.copy' : 'planning.create',
      (services, actor, input: Input<Services['plannings']['create']>) =>
        services.plannings.create(actor, input),
    ),
    changePlanning: protect(
      WRITE_ROLES,
      (input: ChangePlanningInput) => 'planning.' + input.operation,
      (services, actor, input: ChangePlanningInput) => services.plannings.change(actor, input),
    ),
    viewGrid: protect(
      READ_ROLES,
      undefined,
      (services, actor, input: { id: string; revisionId?: string | undefined }) =>
        services.grid.view(actor, input),
    ),
    // A prévia não grava nada: não bloqueia app_state nem gera auditoria.
    previewGrid: protect(WRITE_ROLES, undefined, (services, actor, input: GridCommand) =>
      services.grid.preview(actor, input),
    ),
    applyGrid: protect(WRITE_ROLES, 'planning.grid', (services, actor, input: GridCommand) =>
      services.grid.apply(actor, input),
    ),
    undoGrid: protect(
      WRITE_ROLES,
      'planning.gridUndo',
      (services, actor, input: Input<Services['grid']['undo']> & { id: string }) =>
        services.grid.undo(actor, input),
    ),
    changeGridRules: protect(
      WRITE_ROLES,
      'planning.gridRules',
      (services, actor, input: Input<Services['grid']['changeRules']> & { id: string }) =>
        services.grid.changeRules(actor, input),
    ),
    listGenerations: protect(
      READ_ROLES,
      undefined,
      (services, actor, input: { id: string; revisionId?: string | undefined }) =>
        services.generation.list(actor, input),
    ),
    detailGeneration: protect(
      READ_ROLES,
      undefined,
      (services, actor, input: Input<Services['generation']['detail']>) =>
        services.generation.detail(actor, input),
    ),
    requestGeneration: protect(
      WRITE_ROLES,
      'planning.generationRequest',
      (services, actor, input: Input<Services['generation']['request']> & { id: string }) =>
        services.generation.request(actor, input),
    ),
    cancelGeneration: protect(
      WRITE_ROLES,
      'planning.generationCancel',
      (services, actor, input: Input<Services['generation']['detail']>) =>
        services.generation.cancel(actor, input),
    ),
    applyGeneration: protect(
      WRITE_ROLES,
      'planning.generationApply',
      (services, actor, input: GenerationCommand & { runId: string }) =>
        services.generation.apply(actor, input),
    ),
    listAudits: protect(
      ADMIN_ROLES,
      undefined,
      (services, _actor, before?: { at: Date; id: string }) => services.audits(before),
    ),
  };
}
