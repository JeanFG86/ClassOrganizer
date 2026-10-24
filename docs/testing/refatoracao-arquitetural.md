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
