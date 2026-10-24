# ADR 0018 — Versões intermediárias e restauração de revisões

- **Status:** aceita
- **Data:** 24/10/2026
- **Complementa:** ADRs 0012, 0013 e 0017

## Contexto

A E7 precisa permitir identificar, comparar e recuperar alternativas da grade. Concluir uma revisão já exige conferências e uma grade válida; essa aprovação não deve ser necessária para guardar uma alternativa ainda incompleta. Alterações posteriores dos cadastros também não podem mudar a interpretação de uma revisão antiga.

## Decisão

- Cada revisão pode receber um nome opcional de até 100 caracteres. O nome é metadado e pode mudar depois da conclusão; a operação exige perfil de edição, versão do planejamento e auditoria.
- **Preservar revisão e continuar** mantém o rascunho atual no histórico e abre outra revisão com exatamente a mesma fotografia, regras, alocações e fixações. Não captura a base atual nem aprova a grade. As conferências do novo rascunho começam pendentes.
- **Restaurar revisão** cria outro rascunho com a fotografia, regras, alocações e fixações da revisão histórica escolhida. A origem fica em `restoredFromId`; uma FK composta garante que ela pertence ao mesmo planejamento. A revisão atual também fica preservada, mesmo se incompleta. A tela exige confirmação explícita dessa transição.
- Revisões concluídas e rascunhos históricos permitem somente mudar o nome. O banco protege seu conteúdo, suas alocações e o histórico. Somente o último rascunho de um planejamento ativo é editável pela aplicação.
- As cópias exatas registram um evento `import` na grade nova, inclusive quando vazia. Esse evento não pode ser desfeito; a origem continua disponível para consulta e restauração.
- Comparações são leituras disponíveis aos três perfis. Mostram alocações mantidas, removidas e incluídas, mudanças de fixação, alterações nos cadastros e indicação de mudança nas regras. Nomes e horários das diferenças vêm da fotografia correspondente. Mudanças de cadastro que mantenham o mesmo lugar na grade são indicadas na lista de cadastros; não são apresentadas como movimentações. Datas de criação e contadores de versão dos cadastros são ignorados.
- A comparação recusa resultados se a versão do planejamento mudar durante a leitura. Preservação, restauração, cópia da grade, incremento da versão e auditoria usam a mesma transação e o bloqueio `app_state`.
- Os casos de uso `RenamePlanningRevision`, `ComparePlanningRevisions`, `PreservePlanningRevision` e `RestorePlanningRevision` seguem a ADR 0017. A cópia exata fica em um serviço de aplicação; controllers, contratos, repositórios e composable mantêm suas fronteiras.

## Consequências

- Conclusão continua significando aprovação de uma grade completa e conferida. Preservar um rascunho não equivale a concluí-lo.
- **Novo rascunho com os cadastros atuais** continua sendo o caminho para incorporar mudanças da base após uma conclusão. Preservação e restauração usam dados históricos.
- A migração acrescenta somente colunas opcionais; revisões existentes permanecem sem nome e sem origem de restauração. A proteção das revisões históricas passa a valer também para rascunhos substituídos.
- Uma geração anterior à troca de revisão permanece registrada, mas sua proposta fica desatualizada pelo identificador da revisão. A fila e o cancelamento continuam seguindo a ADR 0014.
- PDF, XLSX, importação CSV e ampliação do checklist de reaproveitamento anual continuam pendentes nas próximas partes da E7. Piloto, backup e operação permanecem na E8.
