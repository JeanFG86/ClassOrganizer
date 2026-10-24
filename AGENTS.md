# Guia para agentes de código — EntreAulas

Este arquivo explica a um agente (Codex, Claude Code ou outro) como continuar o trabalho neste repositório. Leia inteiro antes de mudar qualquer coisa.

> **Se este arquivo ainda não estiver versionado** (`git status` mostra `?? AGENTS.md`), inclua-o no commit da próxima entrega, depois de rodar a verificação de nomes da regra 1.

- **Produto:** organizador de aulas para a secretaria de uma escola. Distribui as cargas dos professores e monta a grade semanal.
- **Plano completo:** [docs/product/PLANO_DESENVOLVIMENTO.md](docs/product/PLANO_DESENVOLVIMENTO.md), com as entregas E0 a E9.
- **Decisões técnicas:** [docs/adr/](docs/adr/) (ADRs 0001 a 0018).
- **Arquitetura atual:** [ADR 0017](docs/adr/0017-refatoracao-arquitetural.md), com um PR por etapa e casos de uso em classes com `execute`. As sete etapas estão implementadas; use as APIs públicas dos módulos e as classes com `execute`. Etapas dependentes podem usar a branch anterior como base, indicada no PR; o usuário continua responsável pelos merges.
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

### Já entregue (PRs #1 a #13, todos na `main`)

| PR  | Branch                       | Entrega                                                                                                                                                                                                                                                           |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1  | `e1/fundacao`                | **E1:** monorepo pnpm, TypeScript estrito, Fastify, Prisma/PostgreSQL, Vue, worker, Docker Compose, CI (3 jobs), regras de arquitetura (dependency-cruiser), Vitest e Playwright.                                                                                 |
| #2  | `e3/professores`             | Disciplinas e professores com habilitações; E2E do CI na imagem oficial do Playwright.                                                                                                                                                                            |
| #3  | `e3/editar-arquivar`         | Editar, arquivar e restaurar, com controle otimista de versão ([ADR 0005](docs/adr/0005-concorrencia-otimista-e-arquivamento.md)).                                                                                                                                |
| #4  | `e3/turmas-atribuicoes`      | Turmas e atribuições de ensino (turma + disciplina → professor + aulas por semana) ([ADR 0006](docs/adr/0006-atribuicoes-de-ensino.md)).                                                                                                                          |
| #5  | `chore/ignorar-dados-locais` | `.gitignore` para `privado/`, `*.roz` e `*.xlsx`.                                                                                                                                                                                                                 |
| #6  | `e3/turnos-horarios`         | Turnos com horário de cada aula e as aulas que cada turma usa ([ADR 0007](docs/adr/0007-turnos-e-aulas.md)).                                                                                                                                                      |
| #7  | `e3/disponibilidade-ha`      | Carga máxima, hora-atividade e horários indisponíveis do professor ([ADR 0008](docs/adr/0008-carga-e-disponibilidade-do-professor.md)).                                                                                                                           |
| #8  | `e3/aulas-compartilhadas`    | Atribuições em blocos simultâneos com um ou mais professores e disciplinas; divisão de carga em blocos separados ([ADR 0009](docs/adr/0009-aulas-compartilhadas.md)).                                                                                             |
| #9  | `e2/motor-prova`             | **E2:** contrato autocontido, validador independente, motor TypeScript em thread e benchmark; homologação operacional pendente antes da E6 ([ADR 0010](docs/adr/0010-motor-de-referencia-e-validacao.md)).                                                        |
| #10 | `e4/acesso-planejamentos`    | **E4:** contas locais, papéis, sessões, auditoria atômica e planejamentos com fotografias da base, cópia e conferências ([ADR 0011](docs/adr/0011-acesso-e-sessoes.md), [ADR 0012](docs/adr/0012-planejamentos-e-revisoes.md)).                                   |
| #11 | `e5/grade-manual`            | **E5:** grade manual por revisão (turma, professor e visão geral), operações atômicas com prévia, regras configuráveis, histórico com desfazer e conclusão com grade completa ([ADR 0013](docs/adr/0013-grade-manual.md)).                                        |
| #12 | `e6/geracao-integrada`       | **E6, primeira parte:** geração automática com fila durável na tabela `generation_run`, worker com reserva renovada, cancelamento, proposta separada, comparação e aplicação única e desfazível ([ADR 0014](docs/adr/0014-geracao-integrada.md)).                 |
| #13 | `e6/preferencias`            | **E6, segunda parte:** preferências em ordem de prioridade (manter a grade atual, evitar janelas, distribuir pelos dias), melhoria por busca local sem relaxar regra obrigatória e métricas na comparação ([ADR 0015](docs/adr/0015-preferencias-na-geracao.md)). |

**Telas existentes:** Início, Disciplinas, Turmas, Turnos (`/turnos`), Recursos especiais (`/recursos`), Professores, Disponibilidade (`/disponibilidade`) e Atribuições; Entrar, Minha conta, Acessos, Planejamentos e Auditoria na E4; Grade (`/planejamentos/:id/grade`) na E5; Geração automática (`/planejamentos/:id/geracao`) na E6.

### Última entrega funcional

- **E7, primeira parte — versões do planejamento:** nome opcional por revisão, preservação de alternativas intermediárias, comparação e restauração em outro rascunho com fotografia, regras e fixações originais. Só o último rascunho é editável; o banco protege também os rascunhos históricos. Nomear, preservar e restaurar exigem perfil de edição, versão otimista e auditoria (ADR 0018).
- **Recursos especiais opcionais** (PR #14, incorporado na `main`): cadastro de recursos (quadra, laboratório) com arquivar e restaurar; cada bloco de aulas reserva até 5 recursos; a fotografia da revisão leva os recursos ativos ao validador e ao motor, que já tratavam a exclusividade; a grade acusa `conflict.resource`. Sem recursos cadastrados, nada muda. Veja a [ADR 0016](docs/adr/0016-recursos-especiais.md). O primeiro acesso continua em [acesso local](docs/operations/acesso-local.md).

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

1. **E7, próximas partes:** impressão/PDF, XLSX, importação CSV e ampliação do checklist de reaproveitamento anual. A primeira parte já permite nomear, preservar, comparar e restaurar revisões (ADR 0018).
2. **E8:** piloto, backup e operação local.

**Metas do motor:** a E6 adotou as metas técnicas provisórias como configuração, por decisão do usuário, e repetiu a prova localmente com as regras da E5 (ADR 0014). Pactuar as metas com a escola continua pendente. Para medir de novo, `privado/e2/e6-policies.mjs` gera as variantes de regras das entradas locais, e `privado/e2/e6b-preferences.mjs` acrescenta a elas as ordens de preferências (ADR 0015). Os relatórios de referência e crescimento ficam somente em `privado/e2/`; não publicar volumes nem resultados derivados da escola. O exemplo público é inteiramente fictício.

**Pendências registradas nas ADRs:**

- Hora-atividade: a E5 configura "qualquer turno" ou "turnos em que o professor tem aulas"; falta "dia fixo da área" e escolha por professor, se a escola pedir.
- Aulas assíncronas e atividades sem turma.
- Preferências (ADR 0015): faltam os horários que o professor "prefere evitar" (terceiro estado da disponibilidade), as janelas das turmas e pesos por professor ou disciplina, se a escola pedir.
- Diagnóstico de inviabilidade: a geração explica capacidade e fixações contraditórias, sem apontar o conjunto mínimo de causas.
- Recursos especiais (ADR 0016): sem capacidade maior que um bloco, sem indisponibilidade própria e sem visão da grade por recurso; a escola ainda não confirmou se precisa deles.
- A carga máxima é hoje só um **alerta** (vira bloqueio se a escola confirmar).
- Arquivar turma ou disciplina com atribuições é permitido.
- Remover uma atribuição apaga de vez.
- Imagem Docker grande (cerca de 800 MB), a otimizar na E8.

---

## 4. Arquitetura e convenções

Veja as ADRs 0001 a 0003. Em resumo:

```text
apps/api            main.ts inicia; composition monta; controllers traduzem; http adapta o Fastify
apps/worker         composition monta; consumers consome; generation executa; health acompanha
apps/web            app compõe Vue e router; modules separa aplicação, infra e apresentação
packages/core       Módulos com domínio, casos de uso execute e portas; APIs públicas por camada
packages/contracts  Esquemas Zod em modules e shared, compartilhados com a web
packages/infrastructure  Adaptadores em modules; conexão, logger, relógio e ids compartilhados
tests/e2e           Playwright contra o Compose completo
```

**Stack:**

- Node 24 com _type stripping_: não há build do back-end. Os pacotes exportam `src/index.ts` e os imports usam a extensão `.ts`.
- pnpm 10, TypeScript 6 estrito (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`: **sem `enum` e sem _parameter properties_**).
- Fastify 5, Zod 4, Prisma 7 (gerador `prisma-client`, saída em `src/generated/prisma`), PostgreSQL 18, Vue 3.5, Vitest 4, Playwright 1.64.

**Acesso e revisões:** a produção usa `createSecureApp`; todo caso de uso exposto é protegido por `makeAuthorizedOperation`. Uma operação nova do catálogo precisa ser classificada como leitura ou escrita em `CATALOG_ACCESS` (`apps/api/src/composition/catalog.ts`). Escritas, versão do catálogo e auditoria usam a mesma transação e o bloqueio `app_state`. Repositórios aceitam cliente transacional. Cadastros são a base compartilhada; cada revisão guarda uma fotografia imutável. A grade (E5) segue o mesmo caminho: toda operação informa a versão do planejamento e a revisão, e o histórico da grade é somente de acréscimo.

**Camadas** (verificadas por `pnpm check:arch`):

- `core` não importa framework nem pacote npm em tempo de execução.
- O domínio não depende da aplicação.
- A web só usa `contracts`.
- Os apps não dependem uns dos outros.

**Padrões do domínio** (siga o código existente em `packages/core/src/modules`):

- **Módulos:** `access`, `school-structure`, `teaching`, `planning`, `timetable` e `generation`. A web tem os módulos correspondentes às suas telas.
- **Casos de uso:** uma classe com `execute` por operação, agrupadas por agregado em `application/usecases/<agregado>.ts`. O construtor recebe `deps: <CasoDeUso>Dependencies`, só com as portas usadas, guardado em `readonly #deps`. Apoio compartilhado entre casos de uso fica em `application/services`; consultas fora de um agregado, em `application/queries`. A composição dos apps usa `bindUseCase` para adaptar os métodos à fronteira de autorização. Funções puras de domínio continuam válidas.
- **Portas:** são definidas em `application/ports` pelo módulo consumidor (por exemplo, `SubjectLookup` e `PeriodLookup` em `teaching/application/ports/repositories.ts`) e implementadas pelos adaptadores.
- **APIs públicas:** outro módulo usa `index.ts`, `domain/index.ts` ou `application/ports/index.ts` conforme a camada. O domínio acessa somente o contrato de domínio do outro módulo. Imports internos entre módulos e atalhos pelo índice raiz do core são proibidos pelo dependency-cruiser.
- **Entidades:** concentram transições e devolvem fotografias independentes por `snapshot()`. Reconstitua dados persistidos com `reconstitute`, preservando identidade, versão e datas. Os repositórios trocam estados serializáveis com os casos de uso. Não crie funções paralelas às transições (como `createX(...)`); testes e fixtures usam `XEntity.create(...).snapshot()`.
- **Erros:** `DomainError` tem `code` estável e `kind` (`validation`, `conflict`, `not_found`, `unauthorized`, `forbidden` ou `rate_limit`), que a API traduz para 400, 409, 404, 401, 403 ou 429. As mensagens são para a secretaria, em português.
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

- **Dependências injetadas:** `app/compose-app.ts` monta cliente HTTP, serviços, sessão e router e chama `provide`; páginas e composables usam `injectRequired(key)`. `main.ts` inicia a aplicação. Os testes fornecem _fakes_.
- **Clientes HTTP:** fábricas `create<Serviço>Api(client)` em `modules/<module>/infra`, interfaces em `application` e chaves em `presentation`. Recebem `HttpClient` explicitamente e validam respostas com os schemas de `contracts`. A apresentação usa portas e a API pública do outro módulo; componentes compartilhados recebem permissões por props.
- **Estado de página:** coordenação de grade, geração e atribuições fica em composables de apresentação; a sessão pertence ao módulo de acesso e é injetada no router. Páginas remontam quando o caminho muda; o acompanhamento da geração não agenda chamadas após desmontar.
- **Suporte de teste:** `testing` é consumido apenas por testes. As regras arquiteturais têm testes que exercitam imports aceitos e proibidos.
- **Estados de tela:** carregando, vazio, erro com "Tentar novamente", e retorno com `role="status"` ou `role="alert"`.
- **Acessibilidade:** rótulos em todos os campos, `aria-label` nas ações de cada linha e navegação por teclado.
- **Celular:** confira cada tela nova a 375 px de largura. A página não pode rolar para o lado; tabelas rolam dentro do próprio card.
- **ESLint:** proíbe `!` (_non-null assertion_); use guardas ou `injectRequired`.

---

## 5. Processo de entrega (commits e PRs)

Fluxo usado em todas as entregas até agora:

1. **Base da entrega:** no fluxo de refatoração aprovado, PRs dependentes podem usar a branch da etapa anterior, indicada no PR, e devem ser incorporados na ordem pelo usuário. No fluxo habitual, **partir da `main` atualizada:** `git checkout main && git pull --ff-only`, depois `git checkout -b <etapa>/<assunto>` (por exemplo, `e3/aulas-compartilhadas` ou `e2/motor-prova`).
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
   pnpm test:e2e                                 # administrador fictício e setup: docs/operations/acesso-local.md; Playwright contra http://localhost:8080
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
