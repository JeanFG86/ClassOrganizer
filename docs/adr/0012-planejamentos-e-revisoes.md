# ADR 0012 — Planejamentos com fotografias da base e revisões imutáveis

- **Estado:** aceita
- **Data:** 2026-10-23
- **Etapa:** E4

## Contexto

A base de preparação da E3 contém disciplinas, professores, habilitações, cargas, disponibilidade, turnos, horários, turmas e atribuições compartilhadas. A grade muda durante o ano. Uma alteração nessa base não pode reescrever silenciosamente o material usado por um planejamento anterior.

## Decisão

Manter os cadastros como base compartilhada de preparação. Criar planejamento com nome, ano, versão e arquivamento, sem mover nem alterar os cadastros existentes. Cada revisão guarda uma fotografia completa dessa base em JSONB, com formato versionado, versão do catálogo e instante de captura. Inclui os registros arquivados para preservar nomes e referências históricas. A interface os identifica; a futura grade deverá selecionar os registros aplicáveis e validar suas relações.

A captura ocorre sob o mesmo bloqueio transacional usado por todas as escritas autorizadas do catálogo. Sua versão avança uma vez por alteração bem-sucedida, junto da auditoria. A fotografia contém os dados da organização, sem contas, senhas, sessões ou auditoria.

O conteúdo da fotografia nunca é editado. Uma revisão começa como rascunho, com duas conferências pendentes: regras/cargas e disponibilidade/hora-atividade. A secretaria consulta os dados legíveis daquela revisão e salva sua conferência. Só pode concluir depois das duas confirmações. Conclusão congela também os metadados da revisão, sem publicar ou gerar uma grade. Um novo rascunho, numerado sequencialmente, captura os cadastros atuais e exige novas conferências. Existe apenas um rascunho atual por planejamento no fluxo da aplicação.

Copiar um planejamento usa a fotografia de sua última revisão, preservando a data e a versão original da base, e registra a origem. A cópia ganha outra identidade e começa com conferências pendentes, mesmo quando a revisão de origem estava conferida. A requisição informa a versão da origem; não copia uma versão modificada entre leitura e gravação. Pode-se copiar também um planejamento arquivado, conforme a política da ADR 0011.

Todas as alterações de revisão, conferência e arquivamento exigem a versão do planejamento. A operação incrementa essa versão, sob condição `WHERE id AND version`. Também confere se o identificador da revisão é o da última revisão daquele planejamento. Uma segunda sessão usando a mesma versão recebe `409 concurrency.stale`, e a interface recarrega antes de continuar. Não há salvamento silencioso por cima de outra sessão.

O banco protege a fotografia e a identidade da revisão com trigger de imutabilidade, impede exclusão e alterações de revisões concluídas e exige as duas conferências para concluir. Há unicidade de número por planejamento e FKs para planejamento e autor. Arquivar preserva as revisões para leitura e download; restaurar requer administrador. A auditoria usa ações distintas para criação, cópia, conferência, conclusão, abertura de rascunho, arquivo e restauração.

## Consequências e próximos passos

- Cadastros alterados depois da captura não entram no rascunho existente. Para incorporá-los, conclua a revisão atual e abra outra com os dados atuais. Não há descarte físico de rascunhos nesta entrega.
- A conferência cobre os campos disponíveis na E3; não inventa regras ainda não configuradas. Recursos especiais continuam condicionados à confirmação; outras políticas seguem as pendências do plano.
- O JSON baixado representa uma revisão de preparação. Não é um arquivo de backup do sistema, nem a exportação da grade da E7.
- O contrato de preparação é diferente do snapshot de entrada do motor da E2. A E5 integrará a grade manual e a tradução explícita desses dados para o validador. Não alimentar o motor diretamente com o JSON de preparação.
- Alterações manuais da grade terão de participar da versão do planejamento, da auditoria e de operações atômicas. Publicação, comparação e saídas finais permanecem na E7.
- O JSONB preserva dados históricos sem manter FKs vivas para cadastros que podem mudar. Evoluções do formato exigem migração ou leitura compatível, preservando as revisões concluídas.
