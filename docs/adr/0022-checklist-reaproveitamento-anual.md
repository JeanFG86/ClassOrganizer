# ADR 0022 — Checklist de conferência e reaproveitamento anual

- **Status:** aceita
- **Data:** 24/10/2026
- **Complementa:** ADRs 0012, 0013 e 0018

## Contexto

A E7 pede o reaproveitamento anual com checklist de revisão dos dados: a secretaria precisa preparar o período seguinte sem recadastrar tudo e sem concluir uma grade sobre dados que não conferiu. Até aqui, cada rascunho tinha duas confirmações (regras/cargas e disponibilidade/hora-atividade) sem nenhuma indicação do que conferir, e a cópia de um planejamento sempre usava a fotografia da origem. Para levar à cópia os cadastros atualizados, era preciso concluir a cópia, o que exige a grade completa, e então abrir um rascunho novo.

## Decisão

- **Cinco itens no checklist**, na ordem da conferência:
  - `structure`: disciplinas, turnos e turmas;
  - `teachers`: professores e habilitações;
  - `assignments`: atribuições, cargas e recursos;
  - `availability`: disponibilidade e hora-atividade;
  - `rules`: regras da grade.

  Cada revisão guarda os itens conferidos (`reviewed_items`), e a conclusão exige todos. Alterar as regras da grade desmarca somente `rules`. Os itens ausentes de um pedido de conferência voltam a ficar pendentes.

- **Pontos de atenção calculados da fotografia**, por item. São avisos e não impedem a conclusão; quem impede é a grade incompleta (ADR 0013). Apontam:
  - turnos sem horários;
  - turmas sem turno ou aulas, que ficam fora da grade, e turmas sem atribuições;
  - professores sem disciplinas, sem atribuições ou acima da carga máxima;
  - atribuições fora da grade (turma arquivada ou sem turno, professor arquivado) e recursos arquivados;
  - turmas com aulas atribuídas diferentes dos horários da semana;
  - professores cujos horários livres nas aulas das suas turmas e nos horários aceitos para hora-atividade não comportam aulas e hora-atividade;
  - exceções do limite diário sem atribuição correspondente.
- **Alterações em relação à referência.** A referência é a revisão anterior do mesmo planejamento. Na primeira revisão de uma cópia, é a revisão de origem, guardada em `source_revision_id`. A comparação é por identificador e por campos com nome legível. Os campos de professor se dividem entre `teachers` (nome, disciplinas, carga máxima, arquivamento) e `availability` (horários indisponíveis, hora-atividade). Professor novo aparece nos dois itens. Versões, datas e chaves de busca não contam como mudança. Itens sem alteração mostram isso e continuam exigindo confirmação.
- **Cópia para o período seguinte.** A cópia escolhe a base:
  - cadastros atuais (`base: 'current'`, padrão da tela);
  - fotografia da origem (`source`, padrão da API e comportamento anterior).

  Também escolhe se traz a grade da origem (`keepGrid`, padrão verdadeiro). Com os cadastros atuais, a grade passa pela mesma tradução do novo rascunho (ADR 0013): alocações de blocos, professores ou aulas que deixaram de existir são descartadas, e o histórico registra a contagem. As regras da grade vêm da origem. A cópia começa com todos os itens pendentes.

- **Consulta.** `GET /api/v1/plannings/:id/revisions/:revisionId/checklist` está disponível aos três perfis e devolve itens, pontos de atenção, alterações e a referência. Como na comparação de versões, recusa com `concurrency.stale` um resultado montado enquanto o planejamento mudava. Salvar a conferência continua sendo `PUT /api/v1/plannings/:id` com `operation: 'review'`, agora com `reviewedItems`, e exige perfil de edição, versão otimista e auditoria `planning.review`.
- **Garantias no banco.** A migração converte as conferências antigas: regras/cargas viram `structure`, `teachers`, `assignments` e `rules`; disponibilidade vira `availability`. Para converter as revisões históricas, desliga por um instante o trigger de imutabilidade. A `CHECK planning_revision_valid` aceita só itens conhecidos e exige os cinco para `sealed_at`. A origem da cópia tem FK para `planning_revision`, não pode apontar para a própria revisão e entra no trigger de imutabilidade.

## Consequências

- Revisões já concluídas continuam concluídas, com os cinco itens. Rascunhos que tinham só uma das conferências antigas mantêm os itens correspondentes.
- Relatórios e XLSX passam a avisar "Conferência do checklist da revisão pendente." enquanto faltar algum item.
- Os pontos de atenção são heurísticos e genéricos. Não substituem o diagnóstico da grade nem regras específicas da escola, que continuam configuradas na tela. A capacidade do professor é um limite superior: não considera conflitos com outras turmas.
- A comparação depende de identificadores estáveis. Um cadastro excluído e recriado com o mesmo nome aparece como removido e incluído.
- Testes cobrem itens, pontos de atenção e alterações no domínio; conferência por item, cópia com cadastros atuais ou sem grade e referência nos casos de uso; rotas HTTP; integração no PostgreSQL com `CHECK`, imutabilidade da origem e permissões; tela com checklist, falha recuperável e opções da cópia; e E2E da preparação do ano seguinte a 375 px. Todos os dados de teste são inventados.
