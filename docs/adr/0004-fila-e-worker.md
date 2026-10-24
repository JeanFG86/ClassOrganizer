# ADR 0004 — Fila de tarefas e worker

- **Status:** substituída pela [ADR 0014](0014-geracao-integrada.md), que adota uma fila própria sobre a tabela de execuções
- **Data:** 22/10/2026

## Contexto

A geração de horários roda fora da requisição HTTP, com durabilidade, cancelamento, recuperação de tarefas abandonadas e idempotência (plano, seção 5.5).

## Situação atual (E1)

- O processo `worker` existe, valida a configuração, conecta ao banco e renova um arquivo de heartbeat usado pelo healthcheck do container. Ainda não consome tarefas.
- Nenhuma fila foi adicionada: não há tarefa real até a E6, e uma dependência sem uso não seria exercitada pelos testes.

## Candidato

**pg-boss** (fila sobre o próprio PostgreSQL), que dispensa um serviço extra no computador da escola.

## Critérios para aceitar na E6

1. Enfileirar a tarefa na mesma transação que registra a execução de geração. Se não for viável, adotar outbox transacional.
2. Recuperar tarefas de um worker interrompido (lease/heartbeat), com teste de reinício.
3. Entrega repetida não aplica o resultado duas vezes (idempotência na aplicação da proposta).
4. Cancelamento cooperativo e expiração por tempo.
5. Funcionar no Compose local e na topologia de publicação escolhida.

Se o pg-boss não cumprir os critérios 1 a 3 com testes de integração, avaliar uma tabela de tarefas própria com `SELECT … FOR UPDATE SKIP LOCKED`.
