<script setup lang="ts">
import { timeFromMinutes, type RevisionDto } from '@classorganizer/contracts';
const props = defineProps<{ snapshot: RevisionDto['snapshot'] }>();
const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
function name(items: readonly { id: string; name: string }[], id: string | null) {
  return items.find((item) => item.id === id)?.name ?? 'Não informado';
}
function period(id: string) {
  for (const shift of props.snapshot.shifts) {
    const period = shift.periods.find((p) => p.id === id);
    if (period)
      return (
        shift.name +
        ', ' +
        timeFromMinutes(period.startMinute) +
        ' às ' +
        timeFromMinutes(period.endMinute)
      );
  }
  return 'Aula não encontrada';
}
</script>
<template>
  <div class="snapshot-data">
    <h4>Disciplinas</h4>
    <p v-if="snapshot.subjects.length === 0">Nenhuma disciplina nesta revisão.</p>
    <ul v-else>
      <li v-for="item in snapshot.subjects" :key="item.id">
        {{ item.name }}{{ item.archivedAt ? ' (arquivada)' : '' }}
      </li>
    </ul>
    <h4>Turnos e horários</h4>
    <p v-if="snapshot.shifts.length === 0">Nenhum turno nesta revisão.</p>
    <ul v-else>
      <li v-for="shift in snapshot.shifts" :key="shift.id">
        <strong>{{ shift.name }}{{ shift.archivedAt ? ' (arquivado)' : '' }}</strong>
        <ul>
          <li v-for="item in shift.periods" :key="item.id">
            {{ timeFromMinutes(item.startMinute) }} às {{ timeFromMinutes(item.endMinute) }}
          </li>
        </ul>
      </li>
    </ul>
    <h4>Turmas</h4>
    <p v-if="snapshot.classGroups.length === 0">Nenhuma turma nesta revisão.</p>
    <ul v-else>
      <li v-for="item in snapshot.classGroups" :key="item.id">
        <strong>{{ item.name }}{{ item.archivedAt ? ' (arquivada)' : '' }}</strong> ·
        {{ name(snapshot.shifts, item.shiftId) }}
        <ul>
          <li v-for="id in item.periodIds" :key="id">{{ period(id) }}</li>
        </ul>
      </li>
    </ul>
    <h4>Professores, carga e disponibilidade</h4>
    <p v-if="snapshot.teachers.length === 0">Nenhum professor nesta revisão.</p>
    <article v-for="teacher in snapshot.teachers" :key="teacher.id" class="card">
      <h5>{{ teacher.name }}{{ teacher.archivedAt ? ' (arquivado)' : '' }}</h5>
      <p>
        Habilitações:
        {{ teacher.subjectIds.map((id) => name(snapshot.subjects, id)).join(', ') || 'Nenhuma' }}.
      </p>
      <p>
        Carga máxima semanal: {{ teacher.maxWeeklyLessons ?? 'não informada' }}. Hora-atividade:
        {{ teacher.planningPeriods }} aulas por semana.
      </p>
      <p v-if="teacher.unavailable.length === 0">Sem horários indisponíveis cadastrados.</p>
      <ul v-else aria-label="Horários indisponíveis">
        <li v-for="slot in teacher.unavailable" :key="slot.weekday + ':' + slot.periodId">
          {{ days[slot.weekday - 1] }} · {{ period(slot.periodId) }}
        </li>
      </ul>
    </article>
    <h4>Atribuições</h4>
    <p v-if="snapshot.assignments.length === 0">Nenhuma atribuição nesta revisão.</p>
    <ul v-else>
      <li v-for="item in snapshot.assignments" :key="item.id">
        <strong>{{ name(snapshot.classGroups, item.classGroupId) }}</strong> ·
        {{ item.weeklyLessons }} aulas por semana
        <ul>
          <li v-for="participant in item.participants" :key="participant.teacherId">
            {{ name(snapshot.teachers, participant.teacherId) }} ·
            {{ name(snapshot.subjects, participant.subjectId) }}
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>
