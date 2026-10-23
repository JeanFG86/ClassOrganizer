# ADR 0009 — Aulas compartilhadas e blocos simultâneos

- **Status:** aceita
- **Data:** 23/10/2026
- **Substitui parcialmente:** [ADR 0006](0006-atribuicoes-de-ensino.md), quanto ao professor único e à unicidade de turma e disciplina.

## Contexto

A secretaria precisa registrar acompanhamento por outro professor, divisão da carga de uma disciplina entre professores e disciplinas que acontecem simultaneamente quando os alunos da turma se dividem. Uma lista de professores por disciplina resolveria o acompanhamento, mas deixaria a simultaneidade entre disciplinas implícita. Já atribuições independentes não distinguiriam aulas simultâneas de aulas em horários separados.

## Decisão

**A atribuição passa a ser um bloco de aulas simultâneas de uma turma.** O bloco conserva o id, a turma, a carga semanal (1 a 40), a data de criação e a versão. Ele contém uma lista ordenada de participações `{ teacherId, subjectId }`. Todos os participantes atuam em cada aula do bloco, com a mesma duração e frequência semanal. O professor só pode aparecer uma vez no bloco, pois não pode ocupar duas atividades simultâneas.

| Situação                                               | Como cadastrar                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| Um professor acompanha outro na mesma disciplina       | Um bloco com dois participantes da mesma disciplina             |
| Duas pessoas dividem as aulas de uma disciplina        | Blocos separados, cada um com seu professor e sua carga         |
| Acompanhamento em apenas parte das aulas               | Um bloco compartilhado e outro com o professor que atua sozinho |
| Disciplinas simultâneas para grupos de alunos da turma | Um bloco com participantes de disciplinas diferentes            |

Não há unicidade por turma e disciplina. Blocos separados representam aulas em horários diferentes, mesmo quando repetem a disciplina ou o professor. A secretaria organiza explicitamente a carga; o cadastro ainda não valida a soma contra a capacidade semanal da turma.

**Contagem de carga:** a turma soma a carga de cada bloco uma vez. Cada professor soma a carga inteira dos blocos em que participa. Duas pessoas no mesmo bloco de duas aulas ocupam duas aulas da turma e duas aulas de cada professor. A disponibilidade consulta todas as participações. O alerta de carga máxima continua como definido na [ADR 0008](0008-carga-e-disponibilidade-do-professor.md).

**Persistência e integridade:**

| Regra                              | Aplicação                            | Banco                                                                    |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| Pelo menos um participante         | `InvalidAssignmentParticipantsError` | Gatilhos de restrição adiados até o fim da transação                     |
| Professor uma vez por bloco        | `InvalidAssignmentParticipantsError` | PK `(assignment_id, teacher_id)`                                         |
| Habilitação de cada participante   | `TeacherNotQualifiedError`           | FK composta `(teacher_id, subject_id) → teacher_subject`, com `RESTRICT` |
| Referências existentes             | `InvalidAssignmentReferenceError`    | FKs de turma, disciplina e habilitação                                   |
| Carga de 1 a 40                    | `InvalidWeeklyLessonsError`          | `CHECK` existente                                                        |
| Ordem válida                       | Ordem da lista                       | `CHECK (position >= 0)`                                                  |
| Edição sem sobrescrever outra tela | Versão do agregado                   | Atualização condicional e transação                                      |

As participações usam a chave natural bloco + professor e são gravadas **por diferença**. As mantidas conservam essa identidade, as ausentes são removidas e as novas são incluídas. Carga, versão e participantes são gravados na mesma transação, que bloqueia primeiro a linha do bloco. Uma falha de habilitação reverte toda a edição. A remoção do bloco exclui suas participações por cascata. A checagem adiada de presença de participantes bloqueia a linha do bloco antes de consultar os filhos, inclusive para escritas diretas no banco.

Novos participantes precisam de professor e disciplina ativos. Uma participação mantida pode continuar ligada a uma disciplina arquivada, permitindo editar a carga ou remover outros participantes. Continua proibido arquivar professor com qualquer participação e remover habilitação utilizada, inclusive quando ele é o segundo participante.

**Migração:** dentro de uma transação, cria a tabela `assignment_participant`, copia cada vínculo antigo para uma participação de posição zero e só então remove as colunas antigas e a unicidade de turma e disciplina. Não altera ids, datas, cargas ou versões. Há teste que aplica as migrações anteriores, insere vínculos fictícios e executa o SQL novo para verificar a preservação e a edição posterior.

**Contrato:** `POST /api/v1/assignments` recebe `{ classGroupId, weeklyLessons, participants }`. O `PUT /:id` recebe `{ weeklyLessons, participants, version }`; a turma permanece. Respostas usam `participants` no lugar de `teacherId` e `subjectId` na raiz. É uma alteração incompatível do contrato interno: API e web devem ser atualizadas juntas. Requisições no formato antigo são rejeitadas. Listagem e remoção mantêm suas rotas.

## Consequências

- O motor (E2/E6) deve reservar um único horário da turma e de todos os participantes para cada ocorrência de um bloco. Blocos diferentes da mesma turma não podem se sobrepor. A simultaneidade será aplicada pelo motor; esta entrega registra a carga, sem criar horários na grade.
- A interface identifica os blocos por número dentro de cada turma e permite adicionar, alterar e remover participantes. Os totais mostram separadamente ocupação da turma e carga de cada professor.
- Ainda não há cadastro de subgrupos de alunos, nem distribuição interna de estudantes. O bloco registra a simultaneidade, sem afirmar que cada aluno cursa todas as disciplinas paralelas.
- Aulas assíncronas, atividades sem turma, geminadas e preferências continuam para entregas futuras. Não se usa um participante fictício para representá-las.
