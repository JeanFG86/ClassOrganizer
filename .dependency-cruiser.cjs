/**
 * Regras de fronteira da arquitetura (ver docs/adr/0001-monolito-modular.md).
 * Executado na CI por `pnpm check:arch`.
 */
module.exports = {
  forbidden: [
    {
      name: 'core-modules-use-public-apis',
      severity: 'error',
      comment: 'Outro módulo é acessado pela API pública da camada necessária.',
      from: { path: '^packages/core/src/modules/([^/]+)/' },
      to: {
        path: '^packages/core/src/modules/',
        pathNot: [
          '^packages/core/src/modules/$1/',
          '^packages/core/src/modules/[^/]+/(index|domain/index|application/ports/index)\\.ts$',
        ],
      },
    },
    {
      name: 'core-domain-uses-domain-apis',
      severity: 'error',
      from: { path: '^packages/core/src/modules/([^/]+)/domain/' },
      to: {
        path: '^packages/core/src/modules/',
        pathNot: [
          '^packages/core/src/modules/$1/',
          '^packages/core/src/modules/[^/]+/domain/index\\.ts$',
        ],
      },
    },
    {
      name: 'core-ports-do-not-depend-on-usecases',
      severity: 'error',
      from: { path: '^packages/core/src/modules/[^/]+/application/ports/' },
      to: { path: '^packages/core/src/modules/[^/]+/application/(usecases|queries)/' },
    },
    {
      name: 'core-shared-does-not-depend-on-modules',
      severity: 'error',
      from: { path: '^packages/core/src/shared/' },
      to: { path: '^packages/core/src/modules/' },
    },
    {
      name: 'core-modules-do-not-import-root',
      severity: 'error',
      from: { path: '^packages/core/src/modules/' },
      to: { path: '^packages/core/src/index\\.ts$' },
    },
    {
      name: 'api-transport-does-not-compose',
      severity: 'error',
      from: { path: '^apps/api/src/(http|controllers)/', pathNot: '\\.test\\.ts$' },
      to: { path: ['^packages/infrastructure/', '^apps/api/src/composition/'] },
    },
    {
      name: 'web-modules-use-public-apis',
      severity: 'error',
      from: { path: '^apps/web/src/modules/([^/]+)/' },
      to: {
        path: '^apps/web/src/modules/',
        pathNot: [
          '^apps/web/src/modules/$1/',
          '^apps/web/src/modules/[^/]+/(index|application/index)\\.ts$',
        ],
      },
    },
    {
      name: 'web-presentation-uses-ports',
      severity: 'error',
      from: {
        path: '^apps/web/src/(modules/[^/]+/presentation|shared/presentation)/',
        pathNot: '\\.test\\.ts$',
      },
      to: { path: '^apps/web/src/(modules/[^/]+/infra|shared/infra)/' },
    },
    {
      name: 'web-application-is-independent',
      severity: 'error',
      from: { path: '^apps/web/src/(modules/[^/]+/application|shared/application)/' },
      to: {
        path: '^apps/web/src/(modules/[^/]+/(presentation|infra)|shared/(presentation|infra))/',
      },
    },
    {
      name: 'web-shared-does-not-depend-on-modules',
      severity: 'error',
      from: { path: '^apps/web/src/shared/', pathNot: '\\.test\\.ts$' },
      to: { path: '^apps/web/src/modules/' },
    },
    {
      name: 'production-does-not-depend-on-test-support',
      severity: 'error',
      from: { path: '^(apps|packages)/[^/]+/src/', pathNot: ['\\.test\\.ts$', '/testing/'] },
      to: { path: '/testing/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Ciclos entre módulos dificultam a evolução independente.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'Import sem dependência declarada no package.json do próprio pacote.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'core-is-framework-free',
      severity: 'error',
      comment: 'O core (domínio + aplicação) não depende de frameworks, ORM ou infraestrutura.',
      from: { path: '^packages/core/' },
      to: {
        path: ['^packages/(infrastructure|contracts)/', '^apps/'],
        dependencyTypes: ['local', 'npm', 'npm-dev', 'aliased-workspace'],
      },
    },
    {
      name: 'core-no-npm-runtime-deps',
      severity: 'error',
      comment: 'O core usa apenas TypeScript e módulos node: estritamente necessários.',
      from: { path: '^packages/core/src/', pathNot: '\\.test\\.ts$' },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer'] },
    },
    {
      name: 'domain-does-not-depend-on-application',
      severity: 'error',
      from: { path: '/domain/' },
      to: { path: '/application/' },
    },
    {
      name: 'contracts-are-transport-only',
      severity: 'error',
      comment: 'Contratos públicos não conhecem o core nem a infraestrutura.',
      from: { path: '^packages/contracts/' },
      to: { path: ['^packages/(core|infrastructure)/', '^apps/'] },
    },
    {
      name: 'infrastructure-not-coupled-to-apps',
      severity: 'error',
      from: { path: '^packages/infrastructure/' },
      to: { path: '^apps/' },
    },
    {
      name: 'web-only-uses-contracts',
      severity: 'error',
      comment: 'O front-end conversa com o back-end apenas pelos contratos da API.',
      from: { path: '^apps/web/' },
      to: { path: ['^packages/(core|infrastructure)/', '^apps/(api|worker)/'] },
    },
    {
      name: 'apps-are-independent',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/([^/]+)/', pathNot: '^apps/$1/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['/generated/', '/dist/'] },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'default'],
      extensions: ['.ts', '.js', '.vue'],
    },
  },
};
