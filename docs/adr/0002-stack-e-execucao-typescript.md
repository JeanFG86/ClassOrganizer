# ADR 0002 — Stack e execução do TypeScript

- **Status:** aceita
- **Data:** 22/10/2026

## Decisão

Versões fixadas em `package.json` e no `pnpm-lock.yaml`:

| Área                   | Escolha                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| Runtime                | Node.js 24 LTS (`.nvmrc`; imagem `node:24.22.1-alpine3.24`)                          |
| Gerenciador            | pnpm 10.34 (`packageManager`)                                                        |
| Linguagem              | TypeScript 6.0, `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Validação de fronteira | Zod 4 (única abordagem; JSON Schema/OpenAPI derivados dele quando necessário)        |
| API                    | Fastify 5                                                                            |
| Interface              | Vue 3.5, Vue Router 5, Vite 8                                                        |
| Testes                 | Vitest 4 (unit, componentes, integração), Vue Test Utils, Testcontainers, Playwright |
| Qualidade              | ESLint 10 + typescript-eslint, Prettier, dependency-cruiser                          |

### Back-end sem etapa de build

API, worker e pacotes internos rodam direto dos arquivos `.ts` com o _type stripping_ nativo do Node 24. Para isso:

- `erasableSyntaxOnly`: proibidos `enum`, `namespace` e _parameter properties_ (sintaxes que exigem transformação).
- Imports relativos usam a extensão `.ts` (`allowImportingTsExtensions`, `noEmit`).
- Pacotes internos exportam `src/index.ts`. Como o pnpm usa links simbólicos, o Node vê o caminho real (`packages/...`) e não o de `node_modules`, onde o type stripping é proibido.
- `tsc` é usado só para checagem de tipos (`pnpm typecheck`).

Benefícios: menos ferramentas, stack traces apontando para o fonte e imagem Docker sem artefatos compilados.

## Alternativas consideradas

- **TypeScript 7 (compilador nativo):** já é a versão `latest`, mas o typescript-eslint 8.72 suporta até `<6.1`. Reavaliar quando o ecossistema de lint e o `vue-tsc` declararem suporte.
- **Vitest 5 / Prisma 8:** Vitest 5 é recente e Prisma 8 ainda está em RC. Ficamos nas linhas estáveis anteriores (Vitest 4.1, Prisma 7.10).
- **`tsc`/bundler para gerar `dist`:** adiciona etapa e configuração sem ganho no perfil de uso local. Pode voltar se a publicação exigir (E9).

## Consequências

- Atualizações de dependências são intencionais (versões exatas) e passam pela CI.
- Quem desenvolve precisa do Node 24.11+ (o `engine-strict` do `.npmrc` impede versões menores).
