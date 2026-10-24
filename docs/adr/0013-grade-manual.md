# ADR 0013 — Grade manual por revisão, validação integrada e histórico de alterações

- **Status:** aceita
- **Data:** 23/10/2026
- **Etapa:** E5
- **Relacionadas:** ADRs [0008](0008-carga-e-disponibilidade-do-professor.md), [0009](0009-aulas-compartilhadas.md), [0010](0010-motor-de-referencia-e-validacao.md) e [0012](0012-planejamentos-e-revisoes.md)

## Contexto

A E4 guarda em cada revisão de planejamento uma fotografia imutável dos cadastros. A E2 entregou um validador independente que confere uma proposta de grade contra um snapshot autocontido. Falta a grade propriamente dita: a secretaria precisa montar e ajustar os horários à mão, ver o efeito de cada alteração antes de confirmá-la e nunca ficar com uma alteração aplicada pela metade.

Algumas políticas da escola continuam sem resposta (onde cumprir hora-atividade, limites diários por disciplina, durações diferentes entre turnos). Elas viram configuração da revisão, não regra fixa no código.

## Decisão

### A grade pertence à revisão

Cada revisão tem sua grade: uma lista de alocações `{ tipo, bloco ou professor, dia, aula, fixada }`. O tipo é `lesson` (uma ocorrência de um bloco de aulas da [ADR 0009](0009-aulas-compartilhadas.md)) ou `planning` (um período de hora-atividade do professor). A identidade da alocação é a própria combinação de revisão, tipo, entidade, dia e aula; o banco impede repetição.

As alocações apontam para identificadores da fotografia, não para os cadastros vivos. Por isso não há FK para blocos, professores ou aulas: o validador confere essas referências a cada leitura. Há FK para a revisão, e um gatilho impede inserir, alterar ou excluir alocações de uma revisão concluída.

### Tradução explícita para o validador

A fotografia de preparação não alimenta o validador diretamente (ADR 0012). Uma tradução no domínio lê o JSON da fotografia com verificações de formato e seleciona os registros aplicáveis:

| Elemento       | Entra na grade quando                                                          |
| -------------- | ------------------------------------------------------------------------------ |
| Turno          | Não está arquivado e tem pelo menos uma turma aplicável                        |
| Turma          | Não está arquivada, tem turno ativo e aulas marcadas                           |
| Professor      | Não está arquivado; indisponibilidades fora das aulas aplicáveis são ignoradas |
| Bloco          | A turma é aplicável e todos os participantes são professores ativos            |
| Hora-atividade | Professor ativo com carga de hora-atividade maior que zero                     |

O resultado é o mesmo `TimetableSnapshot` da E2, com a revisão como origem, as alocações fixadas como fixações e nenhum recurso especial (ainda não confirmado).

**Regra de equivalência de duração.** Cada aula cadastrada conta como uma aula, qualquer que seja sua duração. Quando todas as aulas aplicáveis têm a mesma duração, o snapshot a informa; quando não têm, `lessonMinutes` fica `null` e o validador deixa de exigir duração única. Sobreposições continuam calculadas pelos horários reais, inclusive entre turnos. O motor da E2 não usa a duração, e o contrato dos arquivos do motor passa a aceitar `null`.

**Limites da prova técnica.** Os limites de tamanho da [ADR 0010](0010-motor-de-referencia-e-validacao.md) protegem a busca automática. A validação de uma grade manual percorre apenas o que foi alocado e os desliga explicitamente; o motor continua aplicando-os.

### Regras configuráveis da revisão

Cada revisão guarda suas regras em JSON versionado, editável enquanto for rascunho:

- **Hora-atividade:** em qualquer aula dos turnos aplicáveis (padrão, sem presumir turno) ou somente nos turnos em que o professor tem aulas. Um professor sem aulas atribuídas pode cumprir hora-atividade em qualquer turno.
- **Limite diário por disciplina:** um padrão para toda combinação de turma e disciplina (até 2 aulas por dia, consecutivas quando forem 2, conforme o levantamento) e exceções por turma e disciplina, com 1 ou 2 aulas por dia e consecutividade opcional.

Alterar as regras zera a conferência de regras e cargas da revisão. A mudança pode criar pendências; elas aparecem no diagnóstico e precisam ser resolvidas antes da conclusão.

### Operações atômicas com diagnóstico prévio

As operações são inserir, remover, mover, trocar e fixar/desfixar. Uma troca move duas alocações para o horário uma da outra. Toda operação vira um delta `{ removidas, acrescentadas }` aplicado de uma vez. A tela pede primeiro uma **prévia**, que calcula a grade resultante sem gravar nada, e só então a **confirmação**, que recalcula tudo no servidor.

**Regra para rascunhos incompletos:** um rascunho pode ter aulas e hora-atividade faltando. Uma operação é aceita quando não introduz nenhum problema novo: os problemas da grade resultante, desconsiderando falta de aulas, precisam estar contidos nos problemas da grade atual. Assim, a secretaria pode corrigir aos poucos uma grade herdada com problemas, mas nenhuma alteração piora a grade. Alocações fixadas não podem ser movidas, trocadas nem removidas sem antes serem desfixadas.

A carga máxima semanal do professor continua sendo apenas alerta ([ADR 0008](0008-carga-e-disponibilidade-do-professor.md)). O diagnóstico também mostra, de forma descritiva, as janelas de cada professor (aulas vagas entre duas atividades no mesmo turno e dia); não há preferência configurada nem pontuação.

**Conclusão exige validade total:** concluir uma revisão passa a exigir, além das duas conferências, uma grade completa e sem problemas, verificada com `complete: true`.

### Concorrência, auditoria e histórico

Toda operação, desfazer e alteração de regras informa a versão do planejamento e a revisão atual. Ela incrementa a versão sob `WHERE id AND version`, usa o bloqueio `app_state` e grava a auditoria na mesma transação, como na [ADR 0012](0012-planejamentos-e-revisoes.md).

Cada alteração aceita entra num histórico somente de acréscimo, com número sequencial na revisão, autor, data, resumo legível e delta. **Desfazer** não apaga registros: aplica o inverso da alteração mais recente ainda não desfeita e registra uma nova entrada que aponta para ela. Desfazer obedece à mesma regra de não introduzir problemas; se as regras mudaram no meio-tempo e o estado anterior ficou inválido, o diagnóstico explica o motivo. Não há refazer.

### Novos rascunhos e cópias levam a grade

Abrir um novo rascunho captura os cadastros atuais e traz a grade e as regras da revisão anterior. Alocações cujo bloco, professor ou aula não existe mais na nova fotografia são descartadas; o histórico do rascunho começa com uma entrada que informa quantas foram mantidas e descartadas. Copiar um planejamento leva da mesma forma a fotografia, as regras e a grade da última revisão de origem.

## Consequências

- A secretaria monta e ajusta a grade por turma ou por professor, com visão geral por turno e dia. A legenda usa texto e símbolos, não só cor.
- A integridade da grade depende do validador, não de restrições de banco. O banco garante identidade das alocações, imutabilidade das revisões concluídas e histórico somente de acréscimo.
- A E2E de conclusão de revisão passa a depender de uma grade completa. Como o banco do Compose acumula cadastros entre execuções, a conclusão com grade completa é testada na integração, com banco limpo; a E2E verifica o bloqueio.
- A E6 reaproveita a tradução, as regras e as fixações para alimentar o motor. Aulas assíncronas, atividades sem turma, recursos especiais e preferências com prioridade continuam pendentes.
