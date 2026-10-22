/**
 * Regras de fronteira da arquitetura (ver docs/adr/0001-monolito-modular.md).
 * Executado na CI por `pnpm check:arch`.
 */
module.exports = {
  forbidden: [
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
