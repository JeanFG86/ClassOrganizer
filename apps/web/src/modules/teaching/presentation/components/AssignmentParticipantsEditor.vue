<script setup lang="ts">
import type { AssignmentDto, SubjectDto, TeacherDto } from '@classorganizer/contracts';

type Participant = AssignmentDto['participants'][number];
const participants = defineModel<Participant[]>({ required: true });
const props = defineProps<{
  idPrefix: string;
  subjects: SubjectDto[];
  teachers: TeacherDto[];
  disabled: boolean;
}>();

function availableSubjects(participant: Participant): SubjectDto[] {
  return props.subjects.filter((s) => !s.archivedAt || s.id === participant.subjectId);
}
function availableTeachers(participant: Participant): TeacherDto[] {
  return props.teachers.filter(
    (t) =>
      t.id === participant.teacherId ||
      (!t.archivedAt && t.subjectIds.includes(participant.subjectId)),
  );
}
function changeSubject(index: number): void {
  const participant = participants.value[index];
  if (!participant) return;
  const qualified = props.teachers.filter(
    (t) =>
      !t.archivedAt &&
      t.subjectIds.includes(participant.subjectId) &&
      !participants.value.some((p, i) => i !== index && p.teacherId === t.id),
  );
  if (!qualified.some((t) => t.id === participant.teacherId)) {
    participant.teacherId = qualified.length === 1 ? (qualified[0]?.id ?? '') : '';
  }
}
</script>

<template>
  <fieldset class="participants-editor" :disabled="disabled">
    <legend>Professores no mesmo horário</legend>
    <p class="hint">
      Todos participam de cada aula deste bloco. Para dividir aulas em horários diferentes, crie
      blocos separados.
    </p>
    <div v-for="(participant, index) in participants" :key="index" class="participant-row">
      <div>
        <label :for="idPrefix + '-subject-' + index"
          >Disciplina do participante {{ index + 1 }}</label
        >
        <select
          :id="idPrefix + '-subject-' + index"
          v-model="participant.subjectId"
          @change="changeSubject(index)"
        >
          <option value="">Escolha a disciplina</option>
          <option v-for="s in availableSubjects(participant)" :key="s.id" :value="s.id">
            {{ s.name }}{{ s.archivedAt ? ' (arquivada)' : '' }}
          </option>
        </select>
      </div>
      <div>
        <label :for="idPrefix + '-teacher-' + index"
          >Professor do participante {{ index + 1 }}</label
        >
        <select
          :id="idPrefix + '-teacher-' + index"
          v-model="participant.teacherId"
          :disabled="!participant.subjectId"
        >
          <option value="">Escolha o professor</option>
          <option
            v-for="t in availableTeachers(participant)"
            :key="t.id"
            :value="t.id"
            :disabled="participants.some((p, i) => i !== index && p.teacherId === t.id)"
          >
            {{ t.name }}{{ t.archivedAt ? ' (arquivado)' : '' }}
          </option>
        </select>
        <p v-if="participant.subjectId && availableTeachers(participant).length === 0" class="hint">
          Nenhum professor habilitado nesta disciplina.
          <RouterLink to="/professores">Habilite em Professores</RouterLink>.
        </p>
      </div>
      <button
        v-if="participants.length > 1"
        type="button"
        class="small ghost"
        :aria-label="'Remover participante ' + (index + 1)"
        @click="participants.splice(index, 1)"
      >
        Remover participante
      </button>
    </div>
    <button
      type="button"
      class="small ghost"
      @click="participants.push({ subjectId: '', teacherId: '' })"
    >
      Adicionar professor
    </button>
  </fieldset>
</template>

<style scoped>
.participants-editor {
  min-width: 0;
  margin: 1rem 0;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
}
legend {
  font-weight: 600;
}
.participant-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: 0.75rem;
  align-items: end;
  margin: 1rem 0;
}
.participant-row > div {
  min-width: 0;
}
select {
  min-width: 0;
  max-width: 100%;
}
</style>
