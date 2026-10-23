# ADR 0007 — Turnos, horários das aulas e aulas de cada turma

- **Status:** aceita
- **Data:** 23/10/2026

## Contexto

A grade semanal é montada sobre os horários de aula da escola. Esses horários variam:

- cada turno tem sua sequência de aulas e seus intervalos;
- turmas do mesmo turno podem ter quantidades diferentes de aulas por dia (por exemplo, uma etapa com 5 aulas e outra com 6 no mesmo turno);
- os horários mudam de uma escola para outra e de um ano para outro.

Por isso a estrutura de horários é um cadastro editável pela secretaria, e não uma regra fixa no código.

## Decisão

**Modelo** (módulo `school-structure`):

- **Turno** (`Shift`, tabela `shift`): tem nome e uma lista de **aulas** (`Period`, tabela `shift_period`). Cada aula guarda início e fim em minutos desde a meia-noite. A API expõe os horários como `"HH:MM"`.
- **Intervalos não são cadastrados:** são as lacunas entre o fim de uma aula e o início da seguinte, e a interface os mostra.
- **Turma** (`ClassGroup`): ganha o turno (`shiftId`, opcional) e as aulas do turno que ela usa (`periodIds`, tabela `class_group_period`). Uma turma sem turno ainda não pode entrar na grade.
- O turno e as aulas de uma turma mudam por uma operação própria (`PUT /api/v1/class-groups/:id/schedule`), com controle de versão da turma.

**Regras e onde são garantidas:**

| Regra                                                 | Aplicação                           | Banco                                                                |
| ----------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| De 1 a 12 aulas por turno                             | `InvalidPeriodsError`               | —                                                                    |
| Aula termina depois de começar, dentro do dia         | `InvalidPeriodsError`               | `CHECK`                                                              |
| Aulas do turno não se sobrepõem                       | `InvalidPeriodsError`               | — (ver consequências)                                                |
| Nome do turno único, ignorando acentos e maiúsculas   | `ShiftNameAlreadyInUseError`        | `UNIQUE (normalized_name)`                                           |
| A turma usa só aulas do próprio turno                 | `InvalidClassScheduleError`         | FKs compostas `(class_group_id, shift_id)` e `(period_id, shift_id)` |
| Turma em turno tem ao menos uma aula                  | `InvalidClassScheduleError`         | —                                                                    |
| Não remover do turno uma aula marcada em alguma turma | `PeriodInUseError` (cita as turmas) | FK de `class_group_period` para `shift_period` (`RESTRICT`)          |
| Não arquivar turno com turmas ativas                  | `ShiftInUseError` (cita as turmas)  | —                                                                    |
| Não pôr turma em turno arquivado                      | `InvalidClassScheduleError`         | —                                                                    |

- **Edição das aulas por diferença.** Ao editar um turno, as aulas enviadas com `id` mantêm a identidade (e as marcações das turmas), as sem `id` são criadas e as ausentes são removidas. É o mesmo padrão das habilitações de professores ([ADR 0006](0006-atribuicoes-de-ensino.md)).
- **Mudança de turno numa única gravação.** A turma muda de turno numa só transação: primeiro saem as aulas do turno anterior, depois muda o `shift_id`, depois entram as novas aulas. Assim as FKs compostas nunca veem uma turma com aulas de outro turno.
- **Há testes de integração que gravam direto no repositório,** sem passar pelo caso de uso, para provar que o banco recusa:
  - aula de outro turno na turma;
  - remoção de aula em uso;
  - aula que termina antes de começar.

## Consequências

- **Dias da semana:** ficam fixos, de segunda a sexta, e não fazem parte do cadastro. Se uma escola precisar de sábado ou de dias diferentes por turno, isso entra como mudança explícita.
- **Duração das aulas:** pode variar entre aulas. A carga semanal das atribuições continua contada em aulas, sem converter para minutos (plano, seção 4.1).
- **Sobreposição de aulas:** é garantida pelo domínio e pela versão do turno, não por uma restrição de exclusão no banco. Uma restrição desse tipo exigiria a extensão `btree_gist` e um adiamento da checagem durante a edição.
- **Turnos que se sobrepõem no horário:** são permitidos. Um professor em dois turnos poderá ter conflito real de horário. O motor de horários (E2/E6) deve comparar o horário de fato das aulas, e não apenas a identidade da aula.
- **Ficam para depois:** aulas assíncronas, hora-atividade do professor e atividades sem turma. Elas usam esta mesma estrutura de horários, mas têm regras próprias.
