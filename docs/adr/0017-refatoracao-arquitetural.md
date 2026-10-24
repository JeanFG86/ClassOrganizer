# ADR 0017 — Casos de uso explícitos e organização por módulo

- **Status:** aceita; implementação incremental
- **Data:** 24/10/2026
- **Complementa:** ADRs 0001, 0002 e 0003; substitui o padrão de fábricas de casos de uso da ADR 0001 conforme cada módulo migra.

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

Fábricas e reexports temporários são permitidos durante a migração para manter cada etapa executável. A etapa final elimina compatibilidades que perderam consumidores. Os testes preservam as expectativas de comportamento e acompanham apenas as mudanças de montagem e contratos internos necessárias.

## Consequências

- Permanecem a stack, o monorepo, a topologia API/worker e os contratos públicos existentes.
- A alteração é arquitetural; funcionalidades E7 e E8 seguem no plano do produto.
- A passagem de dados para entidades exige conferir reconstituição, cópias e serialização, especialmente em fotografias históricas.
- Novas fronteiras serão verificadas pelo dependency-cruiser à medida que os módulos migrarem.
- O [registro da refatoração](../testing/refatoracao-arquitetural.md) documenta a base e as verificações relevantes, usando somente informações do código e fixtures públicas inventadas.
