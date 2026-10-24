# ADR 0001 — Monólito modular com Ports and Adapters

- **Status:** aceita
- **Data:** 22/10/2026
- **Evolução:** a [ADR 0017](0017-refatoracao-arquitetural.md) substitui incrementalmente as fábricas por casos de uso com `execute` e detalha a organização interna dos adaptadores.

## Contexto

O produto atende uma escola, com uma equipe pequena de desenvolvimento. A geração de horários é intensiva em CPU e não pode bloquear a API. O plano (seção 3) pede Clean Architecture sem microserviços por entidade.

## Decisão

Um único repositório pnpm com:

| Pacote                    | Papel                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/core`           | Domínio e casos de uso, organizados por módulo de negócio (`src/modules/<módulo>/domain`, `application`). Sem dependências npm em runtime. |
| `packages/contracts`      | Esquemas Zod e tipos públicos da API, compartilhados entre API e web.                                                                      |
| `packages/infrastructure` | Adaptadores concretos: Prisma/PostgreSQL, logger, relógio, ids.                                                                            |
| `apps/api`                | Adaptador HTTP (Fastify) e raiz de composição da API.                                                                                      |
| `apps/worker`             | Processo de tarefas em segundo plano e raiz de composição do worker.                                                                       |
| `apps/web`                | Interface Vue; conversa com o back-end apenas via `contracts` e HTTP.                                                                      |

Regras aplicadas:

- Casos de uso são funções criadas por fábricas (`makeRegisterSubject(deps)`) que recebem as portas de que precisam. A composição é explícita nos `main.ts`, sem contêiner de injeção.
- Portas ficam junto do caso de uso que as define (`application/*-repository.ts`) e são pequenas.
- Erros de negócio estendem `DomainError` com `code` estável e `kind` (`validation`, `conflict`, `not_found`); a API mapeia `kind` para status HTTP em um único lugar.
- As fronteiras são verificadas por `pnpm check:arch` (dependency-cruiser, `.dependency-cruiser.cjs`) na CI: o core não importa infraestrutura, contratos nem frameworks; o domínio não importa a camada de aplicação; a web não importa back-end; não há ciclos; todo import precisa estar declarado no `package.json` do pacote.

## Consequências

- Um módulo novo é uma pasta em `packages/core/src/modules/`, não um pacote novo. Separar em pacotes só se a verificação de fronteiras ficar insuficiente.
- Os contratos HTTP são separados das entidades: mudar o domínio não muda a API sem uma tradução explícita.
