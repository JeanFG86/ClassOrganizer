# ADR 0019 — Impressão e PDF por revisão

- **Status:** aceita
- **Data:** 24/10/2026
- **Complementa:** ADRs 0013, 0017 e 0018

## Contexto

A próxima parte da E7 precisa entregar impressos por turma e professor usando exatamente a revisão escolhida. Uma consulta aos cadastros atuais ou uma impressão da tela de edição poderia misturar nomes e regras históricos, omitir turnos ou apresentar um rascunho como grade aprovada.

## Decisão

- `GetTimetableReport` recebe planejamento, revisão obrigatória, perspectiva e filtro opcional por entidade. O caso de uso é somente leitura, autorizado para os três perfis, e usa as mesmas portas de planejamento e grade. A montagem das folhas é uma função pura do domínio.
- Nomes, horários reais, docência compartilhada, recursos, indisponibilidades e alocações vêm exclusivamente da fotografia e da grade daquela revisão. O relatório não consulta os cadastros atuais. Uma revisão ausente ou uma entidade fora da fotografia produz erro; não há troca silenciosa pela revisão mais recente.
- A leitura confere a versão do planejamento novamente antes de responder, recusando mistura com edição concorrente. O HTTP responde com `Cache-Control: no-store`. A prévia carrega um resultado completo e o mantém até nova leitura explícita, sem atualizar tabelas durante a impressão.
- A interface tem uma página dedicada por planejamento, com seleção de revisão, turma/professor e uma entidade ou todas. Os links em Planejamentos e Grade carregam a revisão explicitamente. Carregamento ou erro bloqueia imprimir uma prévia anterior.
- Cada entidade tem folhas por turno, em matriz semanal. Turmas sem horários recebem uma folha explicativa. No professor, a folha mostra os turnos das atribuições e horas-atividade, ou todos os turnos disponíveis quando não há atuação configurada. Bloqueios de disponibilidade consideram sobreposição pelo horário real, inclusive entre turnos.
- O cabeçalho identifica planejamento, ano, revisão, nome, situação, entidade e turno. Rascunhos e revisões históricas são identificados explicitamente. Pendências da revisão são sinalizadas no impresso e detalhadas na prévia. Fixações, HA, recursos e ausência de alocação têm textos legíveis.
- A geração de PDF usa a impressão nativa do navegador, acionada por **Imprimir / salvar PDF**. O usuário escolhe o destino **Salvar como PDF**. Não há geração nem armazenamento de PDFs na API, nem instalação de Chromium no servidor. O layout homologado usa Chrome ou Edge atual, A4 em paisagem, cabeçalho e rodapé da tabela repetidos, continuação de folhas longas e numeração nas margens.
- O CSS usa `@page` e contadores de página em caixas de margem, suportados pelo Chromium ([documentação oficial](https://developer.chrome.com/blog/print-margins?hl=pt-BR)). Desative cabeçalhos e rodapés adicionais do navegador para evitar endereço da página e duplicação de informações.
- O E2E gera os PDFs pelo Chromium e usa PDF.js, dependência exclusiva de testes, para verificar conteúdo e paginação, além de validar a tela a 375 px. A inspeção local também renderiza os PDFs para conferir o resultado visual.

## Consequências

- Não é necessária migração ou nova dependência de produção. Arquivos salvos pelo usuário ficam sob seu controle e não mudam o banco.
- Uma saída de rascunho representa a versão carregada, identificada pela hora de geração e versão do planejamento. Para incorporar outra edição, use **Atualizar prévia** antes de imprimir.
- Configurações de papel, escala e cabeçalhos do diálogo podem alterar a impressão. A homologação cobre o layout padrão A4 paisagem; outros navegadores e ajustes de impressora dependem de conferência local.
- XLSX, importação CSV e ampliação do checklist anual permanecem para as próximas partes da E7. Backup, atualização e operação ficam na E8.
