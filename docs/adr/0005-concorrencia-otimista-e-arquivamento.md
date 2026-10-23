# ADR 0005 — Concorrência otimista e arquivamento de cadastros

- **Status:** aceita
- **Data:** 23/10/2026

## Contexto

Duas telas abertas (da mesma pessoa ou de pessoas diferentes) podem alterar o mesmo cadastro. Sem controle, a última gravação apaga a anterior sem aviso. O plano (seção 4.2) pede revisão numérica para controle otimista e proíbe excluir fisicamente registros que versões históricas referenciam.

## Decisão

**Versão por cadastro.** Disciplinas e professores têm uma coluna `version`, que começa em 1.

- Toda alteração (editar, arquivar, restaurar) recebe a versão que o usuário estava vendo.
- O caso de uso compara essa versão com a atual e lança `StaleVersionError` se forem diferentes.
- O repositório grava com `UPDATE … WHERE id = ? AND version = ?` e incrementa a versão. Se nenhuma linha for afetada, outra gravação chegou antes e o erro também é `StaleVersionError`. Isso cobre a corrida entre a leitura e a escrita, e há teste de integração com gravações simultâneas.
- A API responde `409 concurrency.stale`. A interface mostra a mensagem, recarrega a lista e descarta a edição, para o usuário decidir sobre os dados atuais.
- Para professores, dados e habilitações são substituídos numa transação, na mesma gravação condicionada pela versão.

**Arquivamento em vez de exclusão.** `archived_at` marca o cadastro como arquivado, e restaurar limpa a marca.

- Disciplina arquivada não aparece como opção para novas habilitações. Professores que já eram habilitados nela continuam habilitados: a habilitação pode ser mantida na edição, mas não acrescentada.
- O nome continua único também entre as arquivadas. Ao tentar criar um nome igual ao de uma disciplina arquivada, a mensagem orienta a restaurá-la.
- Não há rota de exclusão. As FKs (`RESTRICT`) impedem apagar uma disciplina usada em habilitação.

## Consequências

- Os clientes da API precisam enviar `version` em toda alteração (contratos `updateSubjectRequestSchema`, `updateTeacherRequestSchema` e `versionRequestSchema`).
- A versão é por cadastro, não por planejamento. A revisão do planejamento inteiro e a trilha de auditoria (autor e instante de cada alteração) continuam na E4.
- A listagem devolve ativos e arquivados juntos; a interface separa. Se o volume crescer, é possível adicionar um filtro na API.
