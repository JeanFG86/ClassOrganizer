# Guia para agentes de código — EntreAulas

Este arquivo explica a um agente (Codex, Claude Code ou outro) como continuar o trabalho neste repositório. Leia inteiro antes de mudar qualquer coisa.

> **Se este arquivo ainda não estiver versionado** (`git status` mostra `?? AGENTS.md`), inclua-o no commit da próxima entrega, depois de rodar a verificação de nomes da regra 1.

- **Produto:** organizador de aulas para a secretaria de uma escola. Distribui as cargas dos professores e monta a grade semanal.
- **Plano completo:** [docs/product/PLANO_DESENVOLVIMENTO.md](docs/product/PLANO_DESENVOLVIMENTO.md), com as entregas E0 a E9.
- **Decisões técnicas:** [docs/adr/](docs/adr/) (ADRs 0001 a 0009).
- **Como rodar:** [README.md](README.md).

---

## 1. Regras que não podem ser quebradas

1. **Nenhum dado real da escola no repositório.** O repositório é **público**.
   - Não versione o nome da escola, nomes de professores, a grade real nem planilhas.
   - Não versione documentos que descrevam a escola, nem anonimizados: nada de números de turmas, cargas ou listas de disciplinas tirados dos dados reais.
   - Dados reais e anotações de trabalho ficam em `privado/`, que é ignorada pelo git e pelo ESLint. `*.roz` e `*.xlsx` também são ignorados.
   - O que se aprende com os dados reais entra no código só de forma **genérica** (por exemplo, "uma turma pode ter menos aulas que outra no mesmo turno"). Os testes usam dados **inventados**.
   - Antes de cada commit, rode a verificação de nomes nas linhas adicionadas:
     ```bash
     git diff --cached -U0 | grep '^+' > /tmp/added.txt
     node privado/e0/ferramentas/name-leak-check.mjs privado/e0/e0-mapa-professores.tsv /tmp/added.txt
     ```
     Algum nome inventado nas fixtures antigas de teste pode coincidir com um nome real e gerar alerta. Se a linha for só uma fixture já existente que foi reformatada, pode seguir. Qualquer nome novo que gere alerta deve ser trocado por outro inventado.
2. **Nunca faça merge** nem push direto na `main`. Quem faz merge dos PRs é o usuário.
3. **Uma entrega por branch e por PR** (detalhes na seção 5).
4. **Idioma:** o código (identificadores, tipos, nomes de arquivos) é em inglês. A interface, as mensagens de erro, os comentários, a documentação, os commits e os PRs são em **português do Brasil**.

---

## 2. Onde o projeto está

### Já entregue (PRs #1 a #7, todos na `main`)

| PR  | Branch                       | Entrega                                                                                                                                                                           |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1  | `e1/fundacao`                | **E1:** monorepo pnpm, TypeScript estrito, Fastify, Prisma/PostgreSQL, Vue, worker, Docker Compose, CI (3 jobs), regras de arquitetura (dependency-cruiser), Vitest e Playwright. |
| #2  | `e3/professores`             | Disciplinas e professores com habilitações; E2E do CI na imagem oficial do Playwright.                                                                                            |
| #3  | `e3/editar-arquivar`         | Editar, arquivar e restaurar, com controle otimista de versão ([ADR 0005](docs/adr/0005-concorrencia-otimista-e-arquivamento.md)).                                                |
| #4  | `e3/turmas-atribuicoes`      | Turmas e atribuições de ensino (turma + disciplina → professor + aulas por semana) ([ADR 0006](docs/adr/0006-atribuicoes-de-ensino.md)).                                          |
| #5  | `chore/ignorar-dados-locais` | `.gitignore` para `privado/`, `*.roz` e `*.xlsx`.                                                                                                                                 |
| #6  | `e3/turnos-horarios`         | Turnos com horário de cada aula e as aulas que cada turma usa ([ADR 0007](docs/adr/0007-turnos-e-aulas.md)).                                                                      |
| #7  | `e3/disponibilidade-ha`      | Carga máxima, hora-atividade e horários indisponíveis do professor ([ADR 0008](docs/adr/0008-carga-e-disponibilidade-do-professor.md)).                                           |

**Telas existentes:** Início, Disciplinas, Turmas, Turnos (`/turnos`), Professores, Disponibilidade (`/disponibilidade`) e Atribuições.

### Entrega em revisão

- **Aulas compartilhadas:** atribuições em blocos simultâneos, com participações de um ou mais professores e disciplinas; blocos separados repartem a carga. Modelo e contagem de carga na [ADR 0009](docs/adr/0009-aulas-compartilhadas.md).

### Situação da E0 (levantamento)

- A secretaria mandou a grade real do ano. A análise está **só** em `privado/e0/`:
  - `E0_LEVANTAMENTO.md`: retrato, regras observadas e perguntas abertas;
  - CSVs anonimizados;
  - a tabela que liga código a nome de professor;
  - as perguntas com os nomes já colocados.
- O usuário decidiu **não esperar respostas** para avançar. Cada detalhe da escola vira **configuração que a secretaria preenche na tela**, em vez de regra fixa no código. A secretaria valida olhando cada entrega pronta.
- **Conceitos confirmados pelos dados reais** (já estão no modelo ou são os próximos):
  - turnos com quantidades diferentes de aulas por turma;
  - hora-atividade;
  - professores que trabalham em mais de um turno;
  - **aulas com mais de um professor** (segundo docente em reforço, duas professoras dividindo uma disciplina, vários professores no mesmo horário da turma);
  - aulas assíncronas;
  - atividades do professor sem turma;
  - aulas geminadas (no máximo 2 por dia, consecutivas);
  - a grade muda várias vezes ao ano.
- O volume de referência para o teste do motor também está em `privado/e0/`. Use-o localmente e **não** o versione.

---

## 3. O que falta fazer (ordem sugerida)

1. **Recursos especiais, se forem confirmados** (quadra, laboratório): o item "configuração dos recursos especiais" da E3.
2. **E2 — prova técnica do motor de encaixe** (plano, seções 5 e E2):
   - contrato do motor;
   - validador independente;
   - implementação de referência no worker;
   - benchmark com o volume de referência, usado só localmente;
   - restrições entre turnos pelo **horário real** das aulas, já que turnos podem se sobrepor ([ADR 0007](docs/adr/0007-turnos-e-aulas.md));
   - geminadas, indisponibilidade e hora-atividade.

   O OR-Tools não tem interface TypeScript oficial (plano, 5.1). Qualquer componente em outra linguagem exige uma ADR.

3. **E4 a E8** conforme o plano: login e papéis; revisões e auditoria; grade manual com validador; geração no worker; versões e saídas (PDF, XLSX, CSV); piloto, backup e operação local.

**Pendências registradas nas ADRs:**

- Onde a hora-atividade pode ser cumprida (outro turno, dia fixo da área).
- Aulas assíncronas e atividades sem turma.
- Preferências: evitar janelas, preferir certos dias.
- A carga máxima é hoje só um **alerta** (vira bloqueio se a escola confirmar).
- Arquivar turma ou disciplina com atribuições é permitido.
- Remover uma atribuição apaga de vez.
- Imagem Docker grande (cerca de 800 MB), a otimizar na E8.

---

## 4. Arquitetura e convenções

Veja as ADRs 0001 a 0003. Em resumo:

```text
apps/api            Fastify: rotas, tradução de erros, composição (main.ts é a raiz de composição)
apps/worker         Processo de tarefas (o motor entra aqui na E2/E6)
apps/web            Vue 3 + Vite + vue-router
packages/core       Domínio e casos de uso, sem dependência de framework
packages/contracts  Esquemas Zod da API, compartilhados com a web
packages/infrastructure  Prisma/PostgreSQL, logger, relógio e ids
tests/e2e           Playwright contra o Compose completo
```

**Stack:**

- Node 24 com _type stripping_: não há build do back-end. Os pacotes exportam `src/index.ts` e os imports usam a extensão `.ts`.
- pnpm 10, TypeScript 6 estrito (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`: **sem `enum` e sem _parameter properties_**).
- Fastify 5, Zod 4, Prisma 7 (gerador `prisma-client`, saída em `src/generated/prisma`), PostgreSQL 18, Vue 3.5, Vitest 4, Playwright 1.64.

**Camadas** (verificadas por `pnpm check:arch`):

- `core` não importa framework nem pacote npm em tempo de execução.
- O domínio não depende da aplicação.
- A web só usa `contracts`.
- Os apps não dependem uns dos outros.

**Padrões do domínio** (siga o código existente em `packages/core/src/modules`):

- **Módulos:** `school-structure` (disciplinas, turmas, turnos) e `teaching` (professores, atribuições).
- **Casos de uso** são fábricas `makeX(deps)` que devolvem uma função. Os tipos são exportados como `type X = ReturnType<typeof makeX>`.
- **Portas:** são definidas pelo módulo que as usa (por exemplo, `SubjectLookup`, `PeriodLookup` em `teaching/application/ports.ts`) e implementadas pelos repositórios.
- **Erros:** `DomainError` tem `code` estável e `kind` (`validation`, `conflict` ou `not_found`), que a API traduz para 400, 409 ou 404. As mensagens são para a secretaria, em português.
- **Concorrência otimista:** todo cadastro tem `version`. A gravação usa `updateMany WHERE id AND version` e, se nada mudar, lança `StaleVersionError` (409 `concurrency.stale`). A tela recarrega.
- **Arquivar em vez de excluir** (`archivedAt`), com restaurar.
- **Listas filhas** (habilitações, aulas do turno, aulas da turma) são atualizadas **por diferença**: as que vêm com `id` mantêm a identidade, as novas são criadas e as ausentes são removidas.
- **Garantias também no banco:**
  - FKs compostas: professor habilitado, aula do mesmo turno da turma;
  - `CHECK`s, **escritos à mão no fim do `migration.sql`**;
  - há testes de integração que gravam direto no repositório, sem passar pelo caso de uso, para provar a garantia do banco.

**Migrações:**

- Altere `packages/infrastructure/prisma/schema.prisma`.
- Com o banco de desenvolvimento no ar, rode `pnpm db:migrate:dev --name ...`.
- Sem banco, gere o SQL comparando com o schema anterior:
  ```bash
  git show HEAD:packages/infrastructure/prisma/schema.prisma > /tmp/old.prisma
  cd packages/infrastructure
  pnpm exec prisma migrate diff --from-schema /tmp/old.prisma --to-schema prisma/schema.prisma --script
  ```
  Salve em `prisma/migrations/<timestamp>_<nome>/migration.sql`, acrescente os `CHECK`s e rode `pnpm exec prisma generate`.

**Web:**

- **Dependências injetadas** com `provide` em `main.ts` e `injectRequired(key)` nas páginas. Os testes fornecem _fakes_.
- **Clientes HTTP** ficam em `apps/web/src/services/*-api.ts` e validam as respostas com os esquemas de `contracts`.
- **Estados de tela:** carregando, vazio, erro com "Tentar novamente", e retorno com `role="status"` ou `role="alert"`.
- **Acessibilidade:** rótulos em todos os campos, `aria-label` nas ações de cada linha e navegação por teclado.
- **Celular:** confira cada tela nova a 375 px de largura. A página não pode rolar para o lado; tabelas rolam dentro do próprio card.
- **ESLint:** proíbe `!` (_non-null assertion_); use guardas ou `injectRequired`.

---

## 5. Processo de entrega (commits e PRs)

Fluxo usado em todas as entregas até agora:

1. **Partir da `main` atualizada:** `git checkout main && git pull --ff-only`, depois `git checkout -b <etapa>/<assunto>` (por exemplo, `e3/aulas-compartilhadas` ou `e2/motor-prova`).
2. **Implementar a entrega inteira:**
   - domínio com testes de unidade;
   - repositório e migração com testes de integração;
   - contrato e rotas com testes HTTP;
   - telas com testes de componente;
   - E2E do fluxo principal;
   - ADR quando houver decisão, e a linha "Estado atual" do README.

   Commits maiores, cobrindo várias etapas, são bem-vindos quando o usuário pedir.

3. **Verificar localmente,** tudo verde antes do commit:
   ```bash
   pnpm verify                                   # formatação, lint, tipos, arquitetura, unidade e componentes
   pnpm test:integration                         # PostgreSQL via Testcontainers (requer Docker)
   docker compose up -d --build --wait           # sobe a stack com a migração nova
   pnpm test:e2e                                 # Playwright contra http://localhost:8080
   ```
   Confira também a tela nova a 375 px de largura e rode a verificação de nomes (regra 1).
4. **Commit único por entrega**, com mensagem em português:
   - título no formato `tipo: resumo` (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`);
   - corpo explicando o que mudou e por quê, com tópicos por camada;
   - trailer de coautoria da ferramenta, se houver.
5. **Push e PR para a `main`** com `gh pr create` (no Windows o executável está em `"C:\Program Files\GitHub CLI\gh.exe"`).
   - Título igual ao do commit.
   - O corpo segue o padrão dos PRs anteriores, com as seções **O que muda** (por camada), **Por quê**, **Como foi validado (local)** (com o número de testes de cada suíte) e **Pontos para revisão**. Use tabelas quando ajudarem.
6. **O CI roda 3 jobs:** qualidade e unidade, integração e E2E. Se algum falhar, investigue com `gh pr checks <n>` e `gh run view <id> --log-failed`, corrija na mesma branch e faça push.
7. **O usuário revisa e faz o merge.** Depois disso, a próxima entrega parte da `main` atualizada.

---

## 6. Problemas conhecidos do ambiente (Windows)

- **Docker Desktop não sobe** com "sailor-ingest.sock: Não é possível o acesso ao arquivo". Clique em **Quit** (nunca em "Reset to factory defaults", que apaga os volumes com o banco). Depois encerre os processos `*docker*`, rode `wsl --shutdown`, apague `%LOCALAPPDATA%\Docker\run\sailor-ingest.sock` e reabra o Docker.
- **Antes do primeiro E2E local:** `pnpm --filter @classorganizer/e2e exec playwright install chromium`.
- **Codificação do curl:** o curl do Windows pode enviar texto em Latin-1. Para testar a API manualmente com acentos, use um arquivo UTF-8 como corpo.
- **Fixtures E2E:** cada teste usa um sufixo aleatório (`randomUUID().slice(0, 8)`), porque o banco do Compose acumula dados entre execuções.
- **Seletores do Playwright:** use `getByLabel(..., { exact: true })` quando o rótulo for parte de outro.
