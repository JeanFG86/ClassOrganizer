# ADR 0020 — Exportação XLSX por revisão

- **Status:** aceita
- **Data:** 24/10/2026
- **Complementa:** ADRs 0013, 0017, 0018 e 0019

## Contexto

A E7 precisa fornecer horários e cargas em uma planilha que represente a revisão escolhida, sem substituir o banco. Cargas cadastradas podem incluir blocos de turmas sem horários ou referências arquivadas que não entram na modelagem da grade. A exportação precisa tornar essa diferença visível e preservar aulas compartilhadas, HA e textos fornecidos nos cadastros.

## Decisão

- `ExportTimetableWorkbook` é uma classe com `execute`, dependente das portas de planejamento, grade, relógio e `TimetableWorkbookWriter`. A preparação dos dados é uma função pura do domínio; ExcelJS 4.4.0 fica exclusivamente no adaptador de infraestrutura. A web recebe apenas um arquivo binário.
- A consulta exige planejamento, revisão e versão do planejamento mostrada na prévia. Usa somente a fotografia e as alocações daquela revisão, incluindo revisões históricas e planejamentos arquivados. Confere a versão antes e depois da leitura; divergência retorna `concurrency.stale`, sem gerar um arquivo com leituras misturadas.
- A operação é somente leitura, autorizada para administrador, editor e consulta pela mesma fronteira das outras operações. Não altera catálogo, versão, histórico nem auditoria. O endpoint `GET /api/v1/plannings/:id/workbook` valida `revisionId` e `version`, responde com o tipo XLSX, `Content-Disposition: attachment` e `Cache-Control: no-store`. O nome usa ano, identificador abreviado, número da revisão e versão, sem nomes dos cadastros.
- O arquivo tem cinco abas: **Revisão**, **Horários**, **Professores**, **Turmas** e **Blocos**. Cada aba identifica planejamento, ano, revisão, situação, versão e datas. Rascunho, revisão histórica e planejamento arquivado são sinalizados explicitamente. Revisão inclui as pendências e os avisos do diagnóstico oficial da grade.
- Horários é uma tabela de alocações, com uma linha por bloco ou HA, dia, turno, início/fim, turma, disciplinas, professores, recursos e fixação. Participantes de blocos compartilhados ficam juntos. Professores e Turmas distinguem aulas cadastradas, exigidas pelo modelo e alocadas. HA tem contagem própria. Um bloco conta uma vez para a turma e uma vez para cada professor participante. Blocos conserva todas as atribuições da fotografia, identificando as que não se aplicam à modelagem atual.
- Cargas são números inteiros em unidades de aula, mesmo com durações diferentes. Horários são números nativos do XLSX formatados como `hh:mm`; datas de identificação são texto ISO em UTC. Carga máxima ausente fica vazia. Os valores representam a fotografia calculada pelo domínio, sem fórmulas de recálculo na planilha.
- Todo texto é gravado como string, nunca como fórmula ou objeto de hyperlink, inclusive valores iniciados por `=`, `+`, `-` ou `@`. Isso conserva literalmente os nomes sem executá-los. Células acima do limite de texto e tabelas acima do limite de linhas do XLSX provocam erro de validação, sem truncamento silencioso.
- A planilha tem filtros, cabeçalhos congelados, larguras e quebra de texto para consulta. A saída para impressão continua sendo o relatório/PDF da ADR 0019; não se exige reduzir tabelas largas a uma página de papel.
- A página passa a se chamar **Impressão e exportação** e baixa a revisão completa, independentemente do filtro da impressão, com esse escopo descrito junto ao botão. O cliente valida o tipo da resposta antes de criar o arquivo, trata erros JSON e sessão expirada, libera a URL temporária e descarta respostas após sair ou trocar a revisão. Versão desatualizada orienta atualizar a prévia.

## Consequências

- Não há migração. ExcelJS é uma nova dependência de produção da infraestrutura e uma dependência de teste do E2E, sem vazamento para domínio ou navegador.
- Arquivos são produzidos em memória no download, sem armazenamento no servidor. A planilha é uma saída estática: edições locais não retornam ao banco, e as cargas não recalculam após edição do arquivo.
- Testes reabrem o XLSX e conferem tipos, contagens, filtros, identificação, ausência de fórmulas e hyperlinks e revisões históricas após alterar os cadastros. A integração prova autorização, concorrência e ausência de escritas. O E2E cobre o download real e a página a 375 px; a conferência visual local usa apenas dados inventados.
- Importação CSV com prévia/validação/confirmação e ampliação do checklist anual são os próximos itens da E7. Operação, backup e otimização das imagens ficam na E8.
