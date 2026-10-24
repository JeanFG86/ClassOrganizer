# EntreAulas — Organizador de Aulas

Aplicação web para a secretaria escolar distribuir cargas de professores e montar a grade semanal, respeitando indisponibilidades, cargas curriculares e regras da escola.

O plano completo está em [docs/product/PLANO_DESENVOLVIMENTO.md](docs/product/PLANO_DESENVOLVIMENTO.md) e as decisões técnicas em [docs/adr](docs/adr).

> **Estado atual:** E1 e os cadastros principais da E3 implementados, incluindo blocos de aulas compartilhadas. A E2 tem contrato de snapshot, validador independente e motor de referência TypeScript executado em thread, com fixações, geminadas, hora-atividade, cancelamento e benchmark ([prova técnica](docs/testing/motor-prova.md), [ADR 0010](docs/adr/0010-motor-de-referencia-e-validacao.md)). A E4 acrescenta login, papéis, sessões persistidas, auditoria e planejamentos com revisões, cópia e conferência (ADRs [0011](docs/adr/0011-acesso-e-sessoes.md) e [0012](docs/adr/0012-planejamentos-e-revisoes.md)). A E5 traz a grade manual de cada revisão, com visões por turma e por professor, prévia e confirmação atômica das alterações, regras configuráveis, histórico com desfazer e conclusão condicionada à grade completa ([ADR 0013](docs/adr/0013-grade-manual.md)). A primeira parte da E6 integra a geração automática: solicitação gravada em fila durável no PostgreSQL, worker com reserva renovada, retomada após interrupção e cancelamento, acompanhamento na tela, proposta separada comparada com a grade atual e aplicação única e desfazível ([ADR 0014](docs/adr/0014-geracao-integrada.md)). A segunda parte acrescenta preferências em ordem de prioridade escolhida pela secretaria: manter a grade atual, evitar janelas dos professores e distribuir cada disciplina pelos dias, melhoradas por busca local sem relaxar nenhuma regra obrigatória e mostradas na comparação ([ADR 0015](docs/adr/0015-preferencias-na-geracao.md)). As metas do motor são provisórias e configuráveis até serem pactuadas com a escola. Próximo passo: recursos especiais, se confirmados; depois versões e saídas (E7).

## Usar localmente (Docker)

Requisitos: Docker Desktop com WSL2 (Windows) ou Docker Engine + Compose v2 (Linux).

```bash
cp .env.example .env        # ajuste POSTGRES_PASSWORD
docker compose up -d --build --wait
```

Antes de entrar, crie o primeiro administrador pelo [procedimento de acesso local](docs/operations/acesso-local.md). Não há usuário ou senha padrão. A migração preserva os cadastros existentes.

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
pnpm dev              # configure APP_ORIGIN=http://localhost:5173 no .env; API :3000, worker e Vite :5173 (com proxy de /api)
```

Para criar uma migração depois de alterar `packages/infrastructure/prisma/schema.prisma`:

```bash
pnpm db:migrate:dev --name descricao_da_mudanca
```

### Scripts

| Script                                                  | O que faz                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm verify`                                           | Formatação, lint, typecheck, fronteiras e testes unitários                                 |
| `pnpm test`                                             | Testes unitários (core, API) e de componentes (web)                                        |
| `pnpm test:integration`                                 | Repositórios contra PostgreSQL real (Testcontainers)                                       |
| `pnpm test:e2e`                                         | Playwright contra a aplicação em execução (`E2E_BASE_URL`, padrão `http://localhost:8080`) |
| `pnpm check:arch`                                       | Regras de dependência entre camadas e pacotes                                              |
| `pnpm engine:solve <entrada.json>`                      | Executa a prova do motor sem banco nem alteração de grade                                  |
| `pnpm engine:fixture <volume.json> <entrada.json>`      | Gera cenário fictício com testemunha validada, sem enviá-la ao motor                       |
| `pnpm benchmark:engine <entrada.json> <relatorio.json>` | Mede três execuções em processos novos e registra correção, tempo e memória                |
| `pnpm build`                                            | Build da interface                                                                         |

Crie o administrador fictício no banco de teste conforme o [guia de acesso](docs/operations/acesso-local.md#e2e). O setup da suíte faz login, sem desabilitar a autenticação.

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
