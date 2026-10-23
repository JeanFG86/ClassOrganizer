# ADR 0008 — Carga máxima, hora-atividade e disponibilidade do professor

- **Status:** aceita
- **Data:** 24/10/2026

## Contexto

Para montar a grade, o motor de horários (E2/E6) precisa saber três coisas sobre cada professor:

- **quanto ele pode trabalhar:** a carga máxima de aulas por semana;
- **quanto tempo de planejamento a grade dele precisa reservar:** a hora-atividade, que ocupa horários do professor sem turma;
- **em que horários ele não pode dar aula:** por exemplo, porque trabalha em outra escola.

Esses valores mudam por professor e por ano. Por isso são cadastrados pela secretaria, e não fixados no código.

## Decisão

**Modelo** (módulo `teaching`, no próprio `Teacher`):

- `maxWeeklyLessons`: de 1 a 60, ou `null` quando não há limite.
- `planningPeriods`: hora-atividade, de 0 a 40 aulas por semana.
- `unavailable`: lista de horários indisponíveis, cada um com dia da semana (1 a 5) e aula de um turno. Nos horários não listados o professor está disponível.

**A indisponibilidade usa as aulas cadastradas** ([ADR 0007](0007-turnos-e-aulas.md)) e não faixas de horário livres. Assim a tela é a mesma grade que a secretaria já conhece. O ensino valida as aulas pela porta `PeriodLookup`, implementada pelo repositório de turnos.

**Regras e onde são garantidas:**

| Regra                                | Aplicação                  | Banco                                             |
| ------------------------------------ | -------------------------- | ------------------------------------------------- |
| Carga máxima de 1 a 60 ou sem limite | `InvalidWorkloadError`     | `CHECK`                                           |
| Hora-atividade de 0 a 40             | `InvalidWorkloadError`     | `CHECK`                                           |
| Dia de segunda a sexta               | `InvalidAvailabilityError` | `CHECK`                                           |
| Aula existente                       | `InvalidAvailabilityError` | FK para `shift_period`                            |
| Horário sem repetição                | ignora repetições          | chave primária `(teacher_id, weekday, period_id)` |

- **A disponibilidade é gravada inteira de uma vez** (`PUT /api/v1/teachers/:id/availability`), com a versão do professor. Nada referencia esses horários, então o repositório apaga e grava de novo.
- **Ao editar nome e habilitações,** quem não envia os campos de carga mantém os valores atuais. A disponibilidade nunca muda por essa rota.
- **Se uma aula sai do turno,** os horários indisponíveis dela somem junto (FK `ON DELETE CASCADE`). Uma restrição sobre um horário que não existe mais não tem efeito.

**A carga máxima é um alerta, não um bloqueio.** A tela de atribuições mostra quem passou do máximo, mas a atribuição é aceita. Motivos:

- ainda não se sabe se a escola trata esse limite como obrigatório;
- garantir a soma das cargas no banco, com atribuições simultâneas, exigiria travar o professor a cada atribuição.

Se a escola decidir que a regra é obrigatória, ela vira validação no caso de uso, com bloqueio da linha do professor.

## Consequências

- O motor de horários recebe, para cada professor:
  - os horários disponíveis;
  - quantas aulas de hora-atividade precisa encaixar fora das turmas;
  - a carga máxima, como verificação.
- **Ficam para depois:**
  - onde a hora-atividade pode ser cumprida (por exemplo, em outro turno ou num dia fixo da área);
  - preferências, como evitar janelas e preferir certos dias.

  Elas serão regras do motor, classificadas como obrigatórias ou preferenciais.

- A tela de disponibilidade mostra só os turnos ativos. Ao salvar, os horários já gravados em turnos arquivados são preservados.
