# ADR 0017 — Casos de uso explícitos e organização por módulo

- **Status:** aceita; sete etapas implementadas
- **Data:** 24/10/2026
- **Complementa:** ADRs 0001, 0002 e 0003; substitui o padrão de fábricas de casos de uso da ADR 0001 nos módulos migrados.

## Contexto

O monólito modular já separa domínio, aplicação, contratos e infraestrutura. Com a evolução do produto, a composição segura da API passou a concentrar rotas, consultas, autorização e montagem de dependências. Na interface, o cliente de acesso também reúne sessão, usuários, planejamentos e auditoria, e as páginas de grade e geração coordenam várias operações.

O usuário aprovou a refatoração baseada no [NodeVue](https://github.com/JeanFG86/NodeVue/tree/3ac15d8a41102a0d386e5691cac6b66441b05b69) e no [cccat24_8](https://github.com/rodrigobranas/cccat24_8/tree/68ebf5df097088b91bd78613e8cd2e8646b97c7a), com um PR por etapa. Adotamos entidades com comportamento, casos de uso por operação, interfaces pequenas e adaptadores substituíveis. A composição permanece explícita e tipada.

## Decisão

### Domínio e aplicação

- Preservar os módulos `access`, `school-structure`, `teaching`, `planning`, `timetable` e `generation` em `packages/core/src/modules`.
- Usar classes de caso de uso com `execute`, recebendo portas pelo construtor e declarando campos explicitamente, conforme `erasableSyntaxOnly`.
- Organizar aplicação em `usecases`, `queries` quando houver consultas específicas, e `ports`. Cada módulo publica sua API em `index.ts`.
- Encapsular transições e invariantes nas entidades; introduzir objetos de valor onde há um conceito e validação próprios. Manter fotografias e propostas como dados imutáveis e serializáveis e algoritmos como funções puras.
- Definir portas no módulo consumidor. Tipos de Prisma, Fastify, Vue e Zod ficam nos adaptadores e contratos.

### API e infraestrutura

- Separar composição por módulo em `apps/api/src/composition`, controllers em `controllers` e transporte em `http`.
- Controllers recebem operações já autorizadas; a composição cria as operações com a fronteira transacional de acesso existente.
- Preservar a atomicidade entre escrita, auditoria e versão do catálogo, o bloqueio `app_state` e o controle otimista.
- Agrupar adaptadores concretos em `packages/infrastructure/src/modules/<module>`; conexão, erros comuns e utilitários de persistência permanecem compartilhados.
- Manter mapeamentos explícitos entre registros, entidades e DTOs. Entidades reconstituídas preservam identidade, versão e datas.

### Worker e interface

- Separar composição e consumo da fila no worker, preservando a execução em thread e a validação independente das propostas.
- Organizar a web em `app`, `modules/<module>/{application,infra,presentation}` e `shared`.
- Injetar cliente HTTP e serviços; montar sessão e roteador na composição da aplicação.
- Separar autenticação, contas, planejamentos e auditoria. Extrair coordenação das páginas complexas para composables, com limpeza de timers e acompanhamento de mudanças de revisão.
- Modelos da interface representam apresentação; o back-end continua verificando as regras oficiais.

## Etapas e critérios de aceite

| Etapa | Entrega                                             | Critério                                                                     |
| ----- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1     | Referência inicial, mapa de dependências e esta ADR | Suítes e contratos atuais registrados                                        |
| 2     | Fluxo completo de disciplinas                       | Entidade, casos de uso, persistência, controller e cliente com o novo padrão |
| 3     | Composição, acesso e HTTP                           | Rotas separadas e garantias de sessão, autorização e transação preservadas   |
| 4     | Domínio e aplicação dos demais módulos              | Operações explícitas, portas e adaptadores organizados                       |
| 5     | Worker e geração                                    | Reserva, renovação, cancelamento, retomada e aplicação única preservados     |
| 6     | Interface por módulos                               | Serviços injetáveis, páginas menores e fluxos preservados                    |
| 7     | Fronteiras e documentação finais                    | Regras arquiteturais, scripts, suítes e documentação consistentes            |

Cada etapa tem uma branch, um commit final e um PR. Etapas dependentes podem partir da branch anterior enquanto o usuário revisa, com a base indicada no PR. O usuário faz os merges na ordem; cada PR deve ser redirecionado para `main` quando sua base for incorporada.

As fábricas e os reexports temporários usados durante a migração foram removidos na etapa final. A composição dos conjuntos de casos de uso fica nos aplicativos; o suporte dos testes monta as mesmas classes em `testing`. Os testes preservam as expectativas de comportamento e acompanham apenas as mudanças de montagem e contratos internos necessárias.

## Consequências

- Permanecem a stack, o monorepo, a topologia API/worker e os contratos públicos existentes.
- A alteração é arquitetural; funcionalidades E7 e E8 seguem no plano do produto.
- A passagem de dados para entidades exige conferir reconstituição, cópias e serialização, especialmente em fotografias históricas.
- Novas fronteiras serão verificadas pelo dependency-cruiser à medida que os módulos migrarem.
- O [registro da refatoração](../testing/refatoracao-arquitetural.md) documenta a base e as verificações relevantes, usando somente informações do código e fixtures públicas inventadas.

## Fronteiras verificadas

- O domínio de outro módulo é acessado por `domain/index.ts`, e suas portas por `application/ports/index.ts`. O índice completo do módulo atende os consumidores externos ao core. Essa separação evita carregar casos de uso pela API de domínio.
- Na web, interfaces são públicas em `application/index.ts`; apresentação pode usar o índice público do outro módulo. Aplicação e apresentação não importam implementações HTTP, e `shared` não importa módulos de negócio.
- Controllers e transporte HTTP não acessam infraestrutura nem composição. Os controllers dos cadastros traduzem explicitamente os estados para DTOs; as rotas validam e traduzem entradas.
- Código de produção não depende de `testing`. Testes com projetos temporários provam que imports proibidos falham e contratos públicos são aceitos.
- Fotografias das entidades são cópias independentes; contratos públicos e migrações permanecem compatíveis.

## Consolidação posterior

Uma revisão depois das sete etapas encontrou partes migradas só na forma. A entrega seguinte ajustou:

- **Planejamento:** as classes deixaram de reconstruir a antiga fábrica a cada `execute`. `ChangePlanning` encaminha `operation` para `OpenPlanningDraft`, `ReviewPlanningRevision`, `SealPlanningRevision`, `ArchivePlanning` e `RestorePlanning`; a leitura e a gravação da grade ficam em `GridReader` e `GridWriter`. Cada caso de uso recebe só as portas que usa.
- **Composição da API:** os serviços da transação têm tipo nomeado, os repositórios de planejamento são criados uma vez por transação e a classificação leitura/escrita do catálogo é explícita em `CATALOG_ACCESS`, sem convenção de nome nem composição fora da transação.
- **Domínio:** as funções paralelas às entidades (`createSubject`, `setUnavailability`, `requireDraft` e semelhantes) foram removidas; a revisão do planejamento ganhou `open` e `changeRules`.
- **Padrões:** casos de uso agrupados por agregado em `usecases`, apoio em `services`, dependências em `#deps`, clientes HTTP da web como fábricas e índices explícitos na infraestrutura. O ESLint passou a recusar imports repetidos do mesmo módulo.

Contratos públicos, códigos de erro, auditoria e migrações não mudaram.
