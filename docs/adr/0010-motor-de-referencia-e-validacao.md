# ADR 0010 — Motor de referência, contrato e validação independente

- **Status:** aceita para a prova técnica E2; homologação operacional pendente
- **Data:** 23/10/2026
- **Relacionadas:** ADRs 0004, 0007, 0008 e 0009

## Contexto

A prova técnica precisa demonstrar encaixe real, distinguir limite de busca de impossibilidade e verificar a proposta fora do algoritmo que a produziu. O contrato deve admitir as aulas compartilhadas da ADR 0009, horários de turnos que se sobrepõem e hora-atividade sem turma.

O volume de referência e seus relatórios ficam exclusivamente em `privado/e2/`. O repositório contém apenas cenários inteiramente inventados. As metas do levantamento ainda não foram pactuadas com a secretaria, portanto os limites desta prova são provisórios e não constituem homologação da grade escolar.

## Decisão

### Fronteiras

- `timetable/domain`: snapshot, alocações, validação do modelo e validador independente de propostas, sem dependências de infraestrutura.
- `generation/application`: porta `TimetableEngine` e caso de uso que rejeita falso sucesso de qualquer adaptador.
- `contracts`: esquemas Zod para arquivos e mensagens da thread.
- `apps/worker/src/generation`: busca de referência, execução em thread, CLI e benchmark. O daemon de heartbeat continua separado; fila durável e aplicação de propostas entram na E6.

A E2 é executável por linha de comando, sem banco e sem modificar a grade atual. Não cria endpoint de geração nem tela que sugira que a integração assíncrona da E6 já existe. Não há alteração de esquema de persistência nesta entrega.

### Snapshot e regras

O snapshot é autocontido, tem versão de modelagem e revisão de origem. Dias, períodos e seus horários reais, turmas, habilitações, indisponibilidades, cargas, recursos exclusivos opcionais, regras diárias e fixações viajam juntos. A thread recebe uma cópia validada; não lê cadastros durante a busca. A captura transacional desses cadastros cabe à integração futura.

- Uma ocorrência de um bloco ocupa a turma e todos os participantes simultaneamente. Blocos distintos da mesma turma não podem se sobrepor.
- A carga de cada bloco e a hora-atividade de cada professor precisam ser exatas. O máximo semanal do professor continua sendo apenas alerta, conforme ADR 0008.
- Sobreposição usa intervalos reais semiabertos: fim de uma atividade pode coincidir com o início da seguinte. Vale para professores, turmas, recursos e indisponibilidade, inclusive entre turnos diferentes.
- Cada combinação de turma e disciplina tem uma regra explícita de uma ou duas aulas por dia e de consecutividade. O limite soma blocos separados da disciplina e conta uma disciplina compartilhada uma vez por ocorrência. Geminadas consecutivas não atravessam intervalos.
- Hora-atividade usa períodos explicitamente autorizados para cada professor. Não se presume em qual turno ela pode ser cumprida. Fixações de hora-atividade também são preservadas.
- Todos os períodos desta versão precisam ter a duração declarada da unidade de aula. Durações distintas são rejeitadas até existir uma regra de equivalência.
- O limite de admissão da prova é de 512 posições de dia/período, 12 mil unidades de aula/HA e um milhão de células de ocupação. Excedê-lo é modelo fora do suporte desta prova, não impossibilidade escolar.

### Busca e estados

A referência usa retrocesso iterativo, escolhe primeiro o menor domínio disponível, ordena períodos pelo menor impacto nas demais escolhas e elimina permutações de ocorrências idênticas. Reinícios determinísticos variam a ordem das tarefas; começam com fatias de dois mil nós e ampliam a fatia a cada quatro reinícios. Todos compartilham o mesmo limite total de tempo e nós. A semente reproduz a sequência de escolhas, desde que a execução não seja cortada por tempo ou recursos.

| Estado          | Significado                                                                      |
| --------------- | -------------------------------------------------------------------------------- |
| `feasible`      | Grade completa aprovada pelo validador independente; não afirma ótimo            |
| `infeasible`    | Fixações contraditórias, limite de capacidade demonstrado ou enumeração esgotada |
| `inconclusive`  | Prazo, nós ou memória esgotados sem solução nem prova                            |
| `cancelled`     | Cancelamento solicitado, inclusive se houver resultado tardio                    |
| `invalid_model` | Estrutura, referências, duração, opções ou tamanho não suportados                |
| `failed`        | Falha técnica, protocolo inválido ou proposta rejeitada pelo validador           |

Uma tentativa interrompida por limite nunca produz prova de inviabilidade. Não há otimização de preferências nesta versão, nem estado de ótimo comprovado. Propostas parciais não são publicadas como resultado.

### Isolamento, prazo e memória

A busca e a validação rodam em `worker_threads`. O processo principal pode manter heartbeat e atender cancelamento. Um sinal compartilhado permite interrupção cooperativa; após 250 ms sem resposta, a thread é encerrada. Há também watchdog de tempo, com tolerância de um segundo para inicialização e validação.

A opção de memória restringe o heap antigo do V8 na thread. Não é um limite de RSS nem cobre toda memória externa; o benchmark mede o pico de RSS do processo completo separadamente. A integração operacional deverá continuar protegida pelos limites do container. Essa distinção acompanha as [garantias documentadas pelo Node.js 24](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html#new-workerfilename-options).

### Correção e evidências

O validador percorre a grade e seus pares de intervalos sem usar contadores, domínios ou funções de encaixe da busca. Confere cargas, referências, habilitações, disponibilidade, conflitos, regras diárias, HA e fixações. O caso de uso descarta propostas inválidas mesmo quando o adaptador declara sucesso. O benchmark repete a validação no processo coordenador e mede cada execução em um processo novo.

Os testes comparam o motor com enumeração independente de casos pequenos, incluindo cargas múltiplas, geminadas, indisponibilidade e fixações. Testes de integração exercitam a thread, o cancelamento, o CLI e o relatório de benchmark reais. O [relatório público](../testing/motor-prova.md) usa apenas o cenário inventado versionado.

### Alternativas e limite da escolha

A busca própria foi mantida como referência da E2, com contrato substituível e sem adicionar dependência de solver. Ela alcançou os limites técnicos provisórios nos cenários locais, após ajustes na ordem de escolhas. Isso não garante desempenho para qualquer configuração nem autoriza avançar à E6 sem nova conferência.

O OR-Tools não foi incorporado: seu catálogo oficial oferece C++, Python, Java e C#, sem apresentar uma interface TypeScript oficial. Adotar outro processo ou componente próprio em outra linguagem continua exigindo revisão de arquitetura, medição e ADR específica. [Catálogo oficial de instalação](https://developers.google.com/optimization/install).

## Consequências e condições de avanço

- Relatórios registram hash da entrada, semente, versão do motor, hardware, tempo, pico de memória, nós, retrocessos e reinícios. Minutos vagos entre atividades são uma métrica descritiva, incluindo intervalos e distância entre turnos; não uma pontuação acordada com a escola.
- A escolha atual não depende de binários adicionais e é testada em Windows e no Docker Linux. Contratos e validador podem ser reaproveitados por outro solver.
- Antes de E6: pactuar metas no hardware pretendido, preencher as políticas pendentes e repetir as medições com restrições representativas. Os cenários locais dimensionados pelo levantamento são sintéticos e não reproduzem toda a topologia ou as regras reais.
- Aulas assíncronas, atividades sem turma, subgrupos de alunos, deslocamento e preferências ainda exigem modelagem própria. Não se descarta nenhum desses dados silenciosamente para obter um resultado desta prova.
