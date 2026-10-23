# EntreAulas — Organizador de Aulas

Aplicação web para a secretaria escolar distribuir cargas de professores e montar a grade semanal, respeitando indisponibilidades, cargas curriculares e regras da escola.

O plano completo está em [docs/product/PLANO_DESENVOLVIMENTO.md](docs/product/PLANO_DESENVOLVIMENTO.md) e as decisões técnicas em [docs/adr](docs/adr).

> **Estado atual:** fundação técnica (E1) concluída e início dos cadastros (E3): disciplinas e professores com as disciplinas que podem lecionar, com edição, arquivamento e proteção contra edição simultânea. Carga, disponibilidade, turmas e geração de horários ainda não existem; dependem do levantamento da E0.

## Usar localmente (Docker)

Requisitos: Docker Desktop com WSL2 (Windows) ou Docker Engine + Compose v2 (Linux).

```bash
cp .env.example .env        # ajuste POSTGRES_PASSWORD
docker compose up -d --build --wait
```

Abra <http://localhost:8080>. Serviços:

| Serviço    | Papel                                                         |
| ---------- | ------------------------------------------------------------- |
| `postgres` | Banco, com volume persistente `pgdata`; sem porta publicada   |
| `migrate`  | Aplica as migrações uma vez e encerra                         |
| `api`      | API HTTP (Fastify), acessível pelo Nginx em `/api`            |
| `worker`   | Processo de tarefas em segundo plano (geração entra na E6)    |
| `web`      | Interface compilada + proxy da API, publicada só em 127.0.0.1 |

Comandos úteis:

```bash
docker compose ps              # estado e healthchecks
docker compose logs -f api     # logs estruturados (JSON)
docker compose down            # para tudo (os dados continuam no volume)
```

> O volume do Docker **não** substitui backup. Backup e restauração serão documentados na E8.

## Desenvolver

Requisitos: Node.js 24.11+ e pnpm 10 (`npm i -g pnpm@10.34.7`), além do Docker para o banco e os testes de integração.

```bash
pnpm install
cp .env.example .env
pnpm db:up            # PostgreSQL em 127.0.0.1:5432 (compose.dev.yaml)
pnpm db:migrate       # aplica as migrações
pnpm dev              # API :3000, worker e Vite :5173 (com proxy de /api)
```

Para criar uma migração depois de alterar `packages/infrastructure/prisma/schema.prisma`:

```bash
pnpm db:migrate:dev --name descricao_da_mudanca
```

### Scripts

| Script                  | O que faz                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm verify`           | Formatação, lint, typecheck, fronteiras e testes unitários                                 |
| `pnpm test`             | Testes unitários (core, API) e de componentes (web)                                        |
| `pnpm test:integration` | Repositórios contra PostgreSQL real (Testcontainers)                                       |
| `pnpm test:e2e`         | Playwright contra a aplicação em execução (`E2E_BASE_URL`, padrão `http://localhost:8080`) |
| `pnpm check:arch`       | Regras de dependência entre camadas e pacotes                                              |
| `pnpm build`            | Build da interface                                                                         |

Antes do primeiro E2E: `pnpm --filter @classorganizer/e2e exec playwright install chromium`.

## Estrutura

```text
apps/
  api/            Fastify: rotas, tradução de erros, composição
  worker/         Processo de tarefas e composição
  web/            Vue + Vite
packages/
  core/           Domínio e casos de uso (sem dependências de framework)
  contracts/      Esquemas Zod da API compartilhados com a web
  infrastructure/ Prisma/PostgreSQL, logger e demais adaptadores
tests/e2e/        Playwright
infra/docker/     Dockerfile multi-stage e Nginx
docs/             Plano, ADRs
```

Convenções: código em inglês; interface, mensagens e documentação em português. Veja a [ADR 0001](docs/adr/0001-monolito-modular.md) para as regras de camadas.

## CI

GitHub Actions (`.github/workflows/ci.yml`) roda qualidade + unitários, integração com PostgreSQL e E2E com o Compose completo. Em caso de falha do E2E, traces, screenshots e logs dos containers ficam como artefato.
