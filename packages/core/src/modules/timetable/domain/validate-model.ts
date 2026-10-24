import { PREFERENCE_CRITERIA, type TimetableIssue, type TimetableSnapshot } from './model.ts';

/**
 * Valida referências e a modelagem; não decide se há uma grade viável. Os limites de tamanho
 * protegem a busca automática; a validação da grade manual os desliga (ADR 0013).
 */
export function validateTimetableModel(
  snapshot: TimetableSnapshot,
  options: { limits?: boolean } = {},
): TimetableIssue[] {
  const slots = snapshot.periods.length * snapshot.weekdays.length;
  const units =
    snapshot.assignments.reduce((sum, a) => sum + a.weeklyLessons, 0) +
    snapshot.teachers.reduce((sum, t) => sum + t.planningPeriods, 0);
  if (
    options.limits !== false &&
    (slots > 512 ||
      units > 12000 ||
      slots * (snapshot.classGroups.length + snapshot.teachers.length + snapshot.resources.length) >
        1000000)
  ) {
    return [
      {
        code: 'model.limit',
        message:
          'O snapshot ultrapassa os limites de tamanho desta prova técnica. Revise o adaptador antes de executar.',
        entityIds: [],
      },
    ];
  }
  const issues: TimetableIssue[] = [];
  const fail = (message: string, ...entityIds: string[]) =>
    issues.push({ code: 'model.invalid', message, entityIds });
  const unique = (ids: readonly string[]) => new Set(ids).size === ids.length;
  const range = (value: number, min: number, max: number) =>
    Number.isInteger(value) && value >= min && value <= max;
  if (snapshot.modelVersion !== 1 || !snapshot.sourceRevision.trim())
    fail('Informe a versão da modelagem e a revisão de origem.');
  if (snapshot.lessonMinutes !== null && !range(snapshot.lessonMinutes, 1, 1440))
    fail('Informe a duração da unidade de aula em minutos.');
  if (
    !snapshot.weekdays.length ||
    !unique(snapshot.weekdays.map(String)) ||
    snapshot.weekdays.some((d) => !range(d, 1, 5))
  )
    fail('Informe dias letivos distintos de segunda a sexta.');
  for (const list of [
    snapshot.periods,
    snapshot.subjects,
    snapshot.classGroups,
    snapshot.teachers,
    snapshot.assignments,
    snapshot.resources,
  ]) {
    if (!unique(list.map((e) => e.id)) || list.some((e) => !e.id.trim()))
      fail('Os identificadores de cada cadastro precisam ser preenchidos e distintos.');
  }
  const periods = new Map(snapshot.periods.map((p) => [p.id, p]));
  const teachers = new Map(snapshot.teachers.map((t) => [t.id, t]));
  const subjects = new Set(snapshot.subjects.map((s) => s.id));
  const classes = new Map(snapshot.classGroups.map((c) => [c.id, c]));
  const resources = new Set(snapshot.resources.map((r) => r.id));
  for (const p of snapshot.periods) {
    if (
      !p.shiftId.trim() ||
      !range(p.startMinute, 0, 1439) ||
      !range(p.endMinute, 1, 1440) ||
      p.endMinute <= p.startMinute ||
      (snapshot.lessonMinutes !== null && p.endMinute - p.startMinute !== snapshot.lessonMinutes)
    )
      fail(
        'Cada período precisa ter horário válido e a duração da unidade de aula da execução.',
        p.id,
      );
  }
  for (const c of snapshot.classGroups) {
    const own = c.periodIds
      .flatMap((id) => (periods.get(id) ? [periods.get(id)] : []))
      .filter((p) => p !== undefined);
    if (
      !c.periodIds.length ||
      !unique(c.periodIds) ||
      own.length !== c.periodIds.length ||
      new Set(own.map((p) => p.shiftId)).size !== 1
    )
      fail('A turma precisa usar períodos existentes de um mesmo turno, sem repetição.', c.id);
    for (let i = 0; i < own.length; i++)
      for (let j = i + 1; j < own.length; j++) {
        const a = own[i];
        const b = own[j];
        if (a && b && a.startMinute < b.endMinute && b.startMinute < a.endMinute)
          fail('As aulas cadastradas para a turma se sobrepõem.', c.id);
      }
  }
  for (const t of snapshot.teachers) {
    if (!unique(t.subjectIds) || t.subjectIds.some((id) => !subjects.has(id)))
      fail('A habilitação precisa apontar para disciplinas existentes.', t.id);
    if (
      !range(t.planningPeriods, 0, 40) ||
      (t.maxWeeklyLessons !== null && !range(t.maxWeeklyLessons, 1, 60))
    )
      fail('A carga ou a hora-atividade do professor é inválida.', t.id);
    if (
      !unique(t.planningPeriodIds) ||
      t.planningPeriodIds.some((id) => !periods.has(id)) ||
      (t.planningPeriods > 0 && !t.planningPeriodIds.length)
    )
      fail(
        'Defina explicitamente em quais períodos o professor pode cumprir hora-atividade.',
        t.id,
      );
    if (t.unavailable.some((u) => !range(u.weekday, 1, 5) || !periods.has(u.periodId)))
      fail('A indisponibilidade precisa apontar para dia e período existentes.', t.id);
  }
  const ruleKeys = snapshot.subjectRules.map((r) => JSON.stringify([r.classGroupId, r.subjectId]));
  if (!unique(ruleKeys)) fail('Há mais de uma regra diária para a mesma disciplina na turma.');
  for (const r of snapshot.subjectRules) {
    if (
      !classes.has(r.classGroupId) ||
      !subjects.has(r.subjectId) ||
      ![1, 2].includes(r.maxPerDay) ||
      typeof r.consecutive !== 'boolean'
    )
      fail('A regra diária de disciplina é inválida.', r.classGroupId, r.subjectId);
  }
  for (const a of snapshot.assignments) {
    if (!classes.has(a.classGroupId) || !range(a.weeklyLessons, 1, 40))
      fail('A atribuição precisa de turma existente e carga de 1 a 40.', a.id);
    if (!a.participants.length || !unique(a.participants.map((p) => p.teacherId)))
      fail('Inclua participantes sem repetir professor no bloco.', a.id);
    if (!unique(a.resourceIds) || a.resourceIds.some((id) => !resources.has(id)))
      fail('O recurso do bloco precisa existir e não se repetir.', a.id);
    for (const p of a.participants) {
      if (
        !subjects.has(p.subjectId) ||
        !teachers.get(p.teacherId)?.subjectIds.includes(p.subjectId)
      )
        fail(
          'Todo participante precisa estar habilitado na disciplina.',
          a.id,
          p.teacherId,
          p.subjectId,
        );
      if (!ruleKeys.includes(JSON.stringify([a.classGroupId, p.subjectId])))
        fail('Defina a regra diária de cada disciplina na turma.', a.classGroupId, p.subjectId);
    }
  }
  const assignments = new Set(snapshot.assignments.map((a) => a.id));
  for (const f of snapshot.fixedLessons) {
    if (
      !assignments.has(f.assignmentId) ||
      !snapshot.weekdays.includes(f.weekday) ||
      !periods.has(f.periodId)
    )
      fail('A fixação precisa referenciar bloco, dia e período existentes.', f.assignmentId);
  }
  for (const f of snapshot.fixedPlanning) {
    if (
      !teachers.has(f.teacherId) ||
      !snapshot.weekdays.includes(f.weekday) ||
      !periods.has(f.periodId)
    )
      fail('A fixação de hora-atividade possui referência inválida.', f.teacherId);
  }
  const { preferences } = snapshot;
  if (preferences) {
    const { order, reference } = preferences;
    if (
      !unique(order) ||
      order.some((c) => !(PREFERENCE_CRITERIA as readonly string[]).includes(c))
    )
      fail('Informe critérios de preferência conhecidos, sem repetição.');
    const known = (weekday: number, periodId: string) =>
      snapshot.weekdays.some((d) => d === weekday) && periods.has(periodId);
    if (
      reference.lessons.some(
        (l) => !assignments.has(l.assignmentId) || !known(l.weekday, l.periodId),
      ) ||
      reference.planning.some((p) => !teachers.has(p.teacherId) || !known(p.weekday, p.periodId))
    )
      fail('A grade de referência das preferências possui referência inválida.');
  }
  return issues;
}
