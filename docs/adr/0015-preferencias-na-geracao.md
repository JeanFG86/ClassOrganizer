# ADR 0015 — Preferências na geração automática: critérios em ordem de prioridade e melhoria por busca local

- **Status:** aceita
- **Data:** 24/10/2026
- **Etapa:** E6, segunda parte (preferências)
- **Relacionadas:** ADRs [0010](0010-motor-de-referencia-e-validacao.md), [0013](0013-grade-manual.md) e [0014](0014-geracao-integrada.md)

## Contexto

A primeira parte da E6 entrega a primeira grade válida que a busca encontra. A grade cumpre as regras obrigatórias e as fixações, mas pode deixar aulas vagas no meio do turno de um professor, juntar no mesmo dia aulas de uma disciplina que caberiam em dias diferentes ou mover sem necessidade aulas que a secretaria já tinha colocado.

O plano (seção 5.3) define a ordem:

1. restrições obrigatórias e carga exigida;
2. fixações;
3. em replanejamentos, menos alterações nas aulas já aceitas, conforme a prioridade escolhida;
4. preferências: janelas, distribuição por dia e horários a evitar.

O plano também exige níveis ou pesos documentados, sem que uma combinação de benefícios compense uma violação obrigatória.

## Decisão

### Critérios

| Critério          | Na tela                               | Métrica (quanto menor, melhor)                                                                                                                                                                     |
| ----------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keep_current`    | Manter a grade atual                  | Alocações não fixadas da grade atual que a proposta tira do lugar                                                                                                                                  |
| `teacher_windows` | Evitar janelas dos professores        | Aulas vagas entre duas atividades do professor (aula ou hora-atividade) no mesmo turno e dia; é a mesma contagem que a grade manual já mostrava                                                    |
| `daily_spread`    | Distribuir cada disciplina pelos dias | Para cada turma e disciplina: o menor valor entre as aulas alocadas e os dias letivos, menos os dias que a disciplina usa. Conta as aulas que repetem um dia quando havia outro dia livre para ela |

Os três critérios valem zero no melhor caso. Uma grade incompleta também é medida: as repetições consideram só as aulas já alocadas.

### Níveis, não pesos

A secretaria marca os critérios desejados e define a ordem entre eles. A comparação entre duas grades é lexicográfica: o primeiro critério decide e cada critério seguinte só desempata os anteriores. Nenhuma melhora num critério de baixo compensa piorar um critério de cima.

Pesos foram descartados porque exigiriam explicar à secretaria quantas janelas valem uma aula movida. A ordem é fácil de escolher e de conferir.

Regras obrigatórias e fixações ficam fora da comparação. A busca nunca aceita uma grade que viole qualquer uma delas, então não há troca possível entre preferência e obrigação.

A ordem sugerida segue o plano: manter a grade atual, evitar janelas e distribuir pelos dias. A tela começa pelas prioridades da última solicitação da revisão. "Distribuir pelos dias" pode ser desmarcado quando a escola prefere aulas geminadas, que a regra diária continua permitindo.

### Como o motor melhora a grade

1. A busca completa da E2 encontra a primeira grade válida. Quando "manter a grade atual" está entre os critérios, a busca tenta primeiro os horários da grade atual de cada aula. A ordem de tentativa muda, mas a completude e a prova de inviabilidade não mudam.
2. Uma busca local parte dessa grade e tenta, ao acaso e com a semente da execução:
   - levar uma aula ou hora-atividade não fixada para outro horário permitido;
   - trocar o horário de duas atividades não fixadas da mesma turma ou do mesmo professor.

   A busca só aceita uma mudança se ela respeitar disponibilidade, conflitos, recursos, limite diário e geminadas, e se não piorar os critérios na ordem escolhida. As métricas são atualizadas aos poucos, a cada mudança.

3. A melhoria para pelo primeiro destes motivos, e o motivo vai para o resultado:

   | Motivo            | Na tela                                                            |
   | ----------------- | ------------------------------------------------------------------ |
   | `preferences_met` | Todos os critérios marcados chegaram a zero                        |
   | `local_optimum`   | Muitas tentativas seguidas sem melhora                             |
   | `time_limit`      | Limite de tempo da execução, com a melhor grade encontrada até ali |
   | `node_limit`      | Limite de nós da execução, com a melhor grade encontrada até ali   |

O resultado continua `feasible`: o motor não afirma que a grade é a melhor possível, exceto quando todos os critérios chegam a zero. O cancelamento durante a melhoria prevalece e descarta a grade. Os limites da [ADR 0014](0014-geracao-integrada.md) valem para a busca e a melhoria somadas.

### Entrada, resumo e conferência

- A solicitação grava a ordem dos critérios nas opções da execução e, na entrada do motor, as preferências: a ordem e a grade de referência, isto é, as alocações não fixadas da revisão naquele momento.
- O resumo SHA-256 que detecta propostas desatualizadas continua calculado sem as preferências. Inserir uma aula não fixada depois da solicitação muda só a referência de "manter a grade atual" e não desatualiza a proposta, como na ADR 0014.
- O validador independente mede as três métricas da proposta sem usar o estado da busca, e o resultado guarda essas medidas. A comparação na tela mede janelas e repetições da grade atual e da proposta da mesma forma.
- Execuções anteriores a esta ADR são lidas sem critérios e sem métricas de preferência.

### Medição

Antes desta entrega, a prova do motor foi repetida localmente com as entradas de referência e de crescimento, em duas combinações de regras da E5 e em duas ordens de critérios. Todas as execuções terminaram com grade aprovada pelo validador, dentro dos limites de tempo e de memória da ADR 0014, e com janelas e repetições menores que as da primeira grade válida. As entradas e os relatórios ficam somente em `privado/e2/`.

## Consequências

- A secretaria escolhe o que importa e em que ordem, e vê na comparação quanto cada critério mudou entre a grade atual e a proposta.
- Regenerar uma grade completa com "manter a grade atual" em primeiro tende a reproduzir a própria grade. Para melhorar janelas numa grade já completa, a secretaria põe esse critério depois dos outros.
- A busca local pode parar num ótimo local. O resultado informa o motivo da parada e não afirma ser o melhor possível.
- Continuam pendentes:
  - horários que o professor "prefere evitar", que exigem um terceiro estado na disponibilidade (E3);
  - janelas das turmas, se a escola as considerar;
  - pesos por professor ou por disciplina, se a ordem única não bastar.
