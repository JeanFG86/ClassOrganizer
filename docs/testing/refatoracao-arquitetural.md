# Referência da refatoração arquitetural

## Base

- Base de código: `fb98909`, após a incorporação de recursos especiais na `main`.
- Decisão: [ADR 0017](../adr/0017-refatoracao-arquitetural.md).
- Execução local em 24/10/2026, Node 24.19.0 e pnpm 10.34.7 via Corepack.
- Testes de integração usam PostgreSQL descartável. E2E usa o projeto Compose separado `classorganizer-refactor`, na porta 8081, com banco próprio e administrador fictício.

## Mapa de dependências e comportamentos a preservar

| Área          | Entrada e dependências                                                                     | Garantias                                                                              |
| ------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Cadastros     | Rotas → operações autorizadas → casos de uso → repositórios                                | Normalização de nomes, arquivamento, identidade das listas filhas e versão otimista    |
| Acesso        | Cookies HTTP → sessão persistida → papéis → unidade de trabalho                            | Expiração, revogação, origem, limites de login e proteção do último administrador      |
| Escritas      | `makeAuthorizedOperation` → `AccessUnitOfWork` → adaptadores do mesmo cliente transacional | Bloqueio `app_state`, auditoria e versão do catálogo atômicos                          |
| Planejamentos | Casos de uso → repositórios de planejamento e grade                                        | Fotografias históricas, revisões, cópia, conferência e conclusão                       |
| Grade         | Controller → prévia/aplicação/desfazer → validador                                         | Conflitos, regras configuráveis, versão da revisão e histórico somente de acréscimo    |
| Geração       | Solicitação → fila PostgreSQL → worker → thread → validador                                | Reserva renovada, cancelamento, retomada, proposta separada e aplicação única          |
| Web           | Composição → serviços HTTP → contratos Zod                                                 | Sessão e permissões, mensagens, tratamento de concorrência, navegação e acessibilidade |

Os caminhos `/api/v1`, as rotas da interface, os códigos de erro e os formatos públicos atuais são a referência de compatibilidade. Os schemas continuam sendo a especificação executável dos contratos, e os testes HTTP e E2E verificam sua utilização.

## Validação inicial

| Verificação                      | Resultado                                                                  |
| -------------------------------- | -------------------------------------------------------------------------- |
| `corepack pnpm verify`           | Aprovado: formatação, lint, tipos, arquitetura e 369 testes em 35 arquivos |
| `corepack pnpm test:integration` | Aprovado: 130 testes em 16 arquivos                                        |
| `corepack pnpm build`            | Aprovado                                                                   |
| Compose isolado e E2E            | Aprovado: stack saudável e 17 testes Playwright                            |

## Validação por etapa

Executar `pnpm verify`, `pnpm build`, integração e E2E antes de cada entrega de código. Registrar no PR os números efetivamente observados. Conferir telas alteradas a 375 px e executar a verificação local de nomes antes de cada commit. Resultados e dados derivados da escola permanecem exclusivamente em `privado/`.

## Resultado das etapas

| Etapa                   | PR                                                        | Unidade e componentes | Integração | E2E |
| ----------------------- | --------------------------------------------------------- | --------------------- | ---------- | --- |
| 1 — Referência e ADR    | [#15](https://github.com/JeanFG86/ClassOrganizer/pull/15) | 369                   | 130        | 17  |
| 2 — Disciplinas         | [#16](https://github.com/JeanFG86/ClassOrganizer/pull/16) | 377                   | 130        | 17  |
| 3 — API                 | [#17](https://github.com/JeanFG86/ClassOrganizer/pull/17) | 377                   | 130        | 17  |
| 4 — Domínio e aplicação | [#18](https://github.com/JeanFG86/ClassOrganizer/pull/18) | 380                   | 130        | 17  |
| 5 — Worker              | [#19](https://github.com/JeanFG86/ClassOrganizer/pull/19) | 380                   | 130        | 17  |
| 6 — Interface           | [#20](https://github.com/JeanFG86/ClassOrganizer/pull/20) | 384                   | 130        | 17  |
| 7 — Consolidação        | [#21](https://github.com/JeanFG86/ClassOrganizer/pull/21) | 391                   | 130        | 17  |
| Limpeza pós-revisão     | PR desta entrega                                          | 392                   | 130        | 17  |

Na etapa 6, foram conferidas 13 telas a 375 px, incluindo grade e geração. O seletor de turmas em Turnos passou a respeitar a largura do card. Os componentes de grade, geração e atribuições preservam os testes de comportamento após extrair a coordenação para composables.

A etapa 7 inclui sete testes de fronteiras arquiteturais, executados com o dependency-cruiser real sobre projetos temporários. Eles verificam rejeição de imports internos entre módulos, aplicação no domínio, persistência no controller, HTTP na apresentação e fixtures em produção, além de aceitar APIs públicas válidas.

Os PRs são encadeados: revisar e incorporar na ordem, atualizando a base para main conforme a etapa anterior for incorporada. O CI completo também é executado em cada PR.

A consolidação final passou em formatação, lint, tipos, fronteiras, 391 testes em 39 arquivos, 130 testes de integração em 16 arquivos, build da interface e 17 E2E. As 13 telas foram conferidas novamente a 375 px. Os comandos de criação de cenário sintético e execução do motor também foram conferidos com a fixture pública inventada.

A limpeza pós-revisão separou os casos de uso de planejamento, tornou explícita a classificação do catálogo na composição da API, removeu as funções paralelas às entidades e uniformizou arquivos e construtores ([ADR 0017](../adr/0017-refatoracao-arquitetural.md#consolidação-posterior)). Nenhuma tela mudou; o E2E rodou no Compose isolado `classorganizer-refactor`, na porta 8081.
