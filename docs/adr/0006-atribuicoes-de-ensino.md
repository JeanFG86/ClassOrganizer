# ADR 0006 — Atribuições de ensino e integridade com as habilitações

- **Status:** aceita
- **Data:** 23/10/2026

## Contexto

A primeira distribuição do produto (plano, seção 1.2) é a de responsabilidade: a secretaria escolhe, entre os professores habilitados, quem dá cada disciplina em cada turma e com que carga semanal. Essas atribuições serão a entrada do motor de horários (E2/E6), então não podem conter dados incoerentes.

## Decisão

**Modelo.** `TeachingAssignment` (tabela `teaching_assignment`) liga turma, disciplina e professor e registra `weeklyLessons`, a carga em unidades de aula (1 a 40). Ela fica no módulo `teaching`. As turmas (`ClassGroup`) ficam em `school-structure`. O ensino consulta turmas e disciplinas pelas portas `ClassGroupStatusLookup` e `SubjectLookup`, que ele mesmo define.

**Regras, com garantia no banco quando possível:**

| Regra                                            | Aplicação                         | Banco                                                      |
| ------------------------------------------------ | --------------------------------- | ---------------------------------------------------------- |
| Um professor por disciplina em cada turma        | `AssignmentAlreadyExistsError`    | `UNIQUE (class_group_id, subject_id)`                      |
| Professor habilitado na disciplina               | `TeacherNotQualifiedError`        | FK composta `(teacher_id, subject_id)` → `teacher_subject` |
| Carga entre 1 e 40                               | `InvalidWeeklyLessonsError`       | `CHECK`                                                    |
| Turma, disciplina e professor ativos ao atribuir | `InvalidAssignmentReferenceError` | — (arquivamento é estado, não exclusão)                    |
| Não remover habilitação em uso                   | `QualificationInUseError`         | a mesma FK composta (`RESTRICT`)                           |
| Não arquivar professor com aulas                 | `TeacherHasAssignmentsError`      | —                                                          |

- Para a FK composta proteger as habilitações, o repositório de professores atualiza habilitações **por diferença**: remove só as desmarcadas e faz upsert das demais. Antes, todas eram apagadas e recriadas, o que seria barrado pela FK.
- Há teste de integração chamando o repositório direto, sem passar pelo caso de uso, para provar que a garantia é do banco.
- **Arquivar turma ou disciplina com atribuições é permitido.** As atribuições continuam registradas e a tela marca "(arquivada)". Assim o módulo `school-structure` não depende do módulo de ensino. Revisitar se a E0 indicar outro comportamento.
- **Remover uma atribuição é exclusão física,** confirmada na interface e condicionada à versão. Ainda não há versões de grade que referenciem atribuições. Quando houver (E5/E7), a remoção passará a respeitar o histórico (plano, seção 4.2).

## Consequências

- O motor de horários poderá confiar que toda atribuição tem professor habilitado e carga válida.
- A carga máxima por professor e a disponibilidade dependem da E0. Hoje a interface só mostra os totais por professor e por turma, sem limite.
- `DELETE /api/v1/assignments/:id?version=N` é a primeira rota de exclusão. O cliente HTTP da web deixou de enviar `content-type` em requisições sem corpo, que o Fastify recusaria.
