# ADR 0014 — Geração automática integrada: fila própria, execuções e aplicação de propostas

- **Status:** aceita
- **Data:** 24/10/2026
- **Etapa:** E6, primeira parte (geração, fila, acompanhamento e aplicação). Preferências ficam na segunda parte.
- **Substitui:** a decisão pendente da [ADR 0004](0004-fila-e-worker.md)
- **Atualizada por:** [ADR 0015](0015-preferencias-na-geracao.md), que acrescenta as preferências com prioridades, as métricas da proposta e a comparação de janelas e repetições
- **Relacionadas:** ADRs [0010](0010-motor-de-referencia-e-validacao.md), [0012](0012-planejamentos-e-revisoes.md) e [0013](0013-grade-manual.md)

## Contexto

A E2 entregou o motor de referência em thread, com validador independente e estados de resultado distintos. A E5 entregou a grade manual de cada revisão, a tradução da fotografia para o snapshot do motor, as regras configuráveis e as fixações. Falta ligar os dois: a secretaria pede uma geração, acompanha o cálculo fora da requisição HTTP, compara a proposta com a grade atual e decide aplicá-la.

O plano (seção 5.5) exige fila durável, recuperação de tarefas abandonadas, cancelamento, processamento idempotente e uma proposta separada da grade atual. A ADR 0004 deixou a escolha da fila para esta etapa, com o pg-boss como candidato.

As metas do levantamento não foram pactuadas com a escola. O usuário decidiu adotar as metas técnicas provisórias da E2 como configuração e validar com a secretaria a partir da entrega pronta.

## Decisão

### Fila sobre a própria tabela de execuções

A fila é a tabela `generation_run`, consumida com `SELECT … FOR UPDATE SKIP LOCKED`. O pg-boss não foi adotado:

- A solicitação precisa ser gravada na mesma transação da auditoria e do bloqueio `app_state` ([ADR 0012](0012-planejamentos-e-revisoes.md)). O pg-boss usa conexão própria, fora da transação do Prisma, e exigiria uma tabela de saída à parte.
- A execução já precisa guardar estado, reserva, entrada e resultado. Uma única linha com essas colunas atende aos critérios da ADR 0004 sem dependência nova.

Os cinco critérios da ADR 0004 são cobertos por testes de integração: solicitação e enfileiramento na mesma transação, recuperação após interrupção, aplicação única, cancelamento e prazo, e funcionamento no Compose.

### A execução

Cada solicitação grava:

- a revisão de origem;
- o snapshot do motor capturado naquele momento: a tradução da fotografia com as regras da revisão e as alocações fixadas como fixações ([ADR 0013](0013-grade-manual.md));
- um resumo SHA-256 desse snapshot em JSON canônico, com chaves ordenadas;
- os limites da busca e uma semente aleatória, para a execução ser reproduzível.

O worker usa somente essa entrada, sem ler cadastros. Há no máximo uma execução ativa (`queued` ou `running`) por planejamento, garantida por índice único parcial.

| Estado                     | Significado                                                                      |
| -------------------------- | -------------------------------------------------------------------------------- |
| `queued`                   | Aguardando um worker                                                             |
| `running`                  | Reservada por um worker, com prazo renovado                                      |
| Estados finais da ADR 0010 | `feasible`, `infeasible`, `inconclusive`, `cancelled`, `invalid_model`, `failed` |

### Reserva, renovação e recuperação

- O worker reserva uma execução por vez, com prazo de 30 segundos pelo relógio do banco, e renova a reserva a cada 5 segundos enquanto a busca roda em thread.
- Uma reserva vencida indica um worker interrompido. A execução volta a ser oferecida e conta uma nova tentativa. Depois de 3 tentativas, termina como `failed` (`abandoned`), sem repetir a busca indefinidamente.
- Só a interrupção do worker gera nova tentativa. Inviabilidade, busca inconclusiva, modelo inválido e falha do motor são resultados finais.
- Encerrar o worker (`SIGTERM`) interrompe a busca e devolve a execução à fila sem consumir tentativa.
- O worker só grava o resultado se a reserva ainda for dele. Um resultado tardio de quem perdeu a reserva é descartado.

### Cancelamento

- Na fila, o cancelamento é imediato.
- Em execução, o cancelamento é registrado e lido na renovação seguinte. O worker então interrompe a thread, que é encerrada à força se não parar em 250 ms ([ADR 0010](0010-motor-de-referencia-e-validacao.md)).
- O cancelamento prevalece sobre qualquer resultado que chegue depois.

### Proposta separada e comparação

Um resultado `feasible` guarda a grade proposta como alocações da revisão, com as fixações da entrada ainda fixadas. A grade atual não muda durante a busca nem depois dela, até a secretaria aplicar a proposta.

A comparação mostra quantas alocações ficam no lugar, quantas são novas e quantas saem, além das janelas dos professores na grade atual e na proposta. As janelas são uma métrica descritiva, sem pontuação; a otimização de preferências fica para a segunda parte da E6.

**Proposta desatualizada:** a revisão deixou de ser o rascunho atual, ou o resumo da entrada mudou porque as fixações, as regras ou a fotografia mudaram. Aulas não fixadas inseridas depois da solicitação não desatualizam a proposta: a comparação é recalculada contra a grade do momento.

### Aplicação

A aplicação é uma operação da grade como as da [ADR 0013](0013-grade-manual.md). Ela informa a versão do planejamento e a revisão, usa o bloqueio `app_state` e grava a auditoria na mesma transação. Em ordem, a aplicação:

1. recusa propostas desatualizadas, já aplicadas ou sem grade completa;
2. confere a proposta outra vez com o validador, exigindo grade completa e sem problemas, sem confiar no resultado gravado;
3. marca a execução como aplicada com gravação condicional, uma única vez;
4. aplica a diferença entre a grade atual e a proposta;
5. registra no histórico uma entrada `generation`, que pode ser desfeita como uma operação manual.

Repetir a requisição, por clique duplo ou por outra sessão, falha pela versão do planejamento ou pela marcação condicional.

### Metas provisórias e configuração

| Limite                     | Valor padrão | Onde                              |
| -------------------------- | ------------ | --------------------------------- |
| Tempo da busca             | 30 s         | API, `GENERATION_TIME_LIMIT_MS`   |
| Nós visitados              | 2 milhões    | API, `GENERATION_NODE_LIMIT`      |
| Heap antigo da thread      | 256 MiB      | API, `GENERATION_MEMORY_LIMIT_MB` |
| Prazo da reserva           | 30 s         | Worker, `GENERATION_LEASE_MS`     |
| Renovação da reserva       | 5 s          | Worker, `GENERATION_HEARTBEAT_MS` |
| Tentativas por interrupção | 3            | Worker, `GENERATION_MAX_ATTEMPTS` |

Os limites da busca são gravados em cada execução. Mudá-los não altera execuções já solicitadas. O container do worker continua limitado a 1 GB de memória pelo Compose.

Antes desta entrega, a prova do motor foi repetida localmente com as entradas de referência e de crescimento em três combinações das regras da E5:

- o padrão: até 2 aulas por dia, geminadas, e hora-atividade em qualquer turno;
- hora-atividade só nos turnos em que o professor tem aulas;
- 1 aula por dia, com hora-atividade nos turnos do professor.

Todas as execuções encontraram uma grade aprovada pelo validador, dentro dos limites de tempo e de memória acima. As entradas e os relatórios ficam somente em `privado/e2/`. Essa medição não substitui o pacto de metas com a escola.

### Interface

A tela de geração acompanha o andamento por consulta periódica a cada 2 segundos. Ela mostra a etapa (na fila, calculando, cancelamento pedido), o tempo decorrido e o limite, sem percentual, porque a busca não tem progresso mensurável. Cada estado final tem uma explicação própria, e a inviabilidade não é apresentada como falha técnica. A proposta pode ser vista por turma ou por professor, com legenda textual para o que muda e o que está fixado.

### Garantias no banco

- `CHECK`s de estado coerente: reserva só em execução, resultado só em estado final, aplicação só de resultado viável.
- Um gatilho torna imutáveis a solicitação e o resultado de uma execução terminada. A única mudança aceita depois é marcar a aplicação, uma vez. Execuções não são excluídas.
- Uma FK composta garante que a revisão pertence ao planejamento da execução.
- O histórico da grade passa a aceitar o tipo `generation`, e desfazer pode apontar para ele.

## Consequências

- A secretaria gera, acompanha, compara e aplica uma grade válida sem sair da revisão. Reiniciar a API ou o worker não perde a solicitação nem aplica o resultado duas vezes.
- Vários workers podem consumir a fila sem disputa, mas cada um processa uma execução por vez. O Compose sobe um worker.
- A comparação é numérica e visual, por turma e por professor. Uma lista detalhada de diferenças por aula pode vir depois, se a secretaria pedir.
- Continuam pendentes a otimização de preferências com prioridades (segunda parte da E6), diagnósticos de inviabilidade mais detalhados, aulas assíncronas, atividades sem turma e recursos especiais.
