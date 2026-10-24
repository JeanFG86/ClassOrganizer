<script setup lang="ts">
import { ref, toRaw, watch } from 'vue';
import type { GridRulesDto } from '@classorganizer/contracts';
import type { GridLookup } from '../services/grid-view.ts';

const props = defineProps<{
  rules: GridRulesDto;
  lookup: GridLookup;
  editable: boolean;
  busy: boolean;
}>();
const emit = defineEmits<{ save: [rules: GridRulesDto] }>();

const draft = ref<GridRulesDto>(structuredClone(toRaw(props.rules)));
watch(
  () => props.rules,
  (rules) => {
    draft.value = structuredClone(toRaw(rules));
  },
);
const newClass = ref('');
const newSubject = ref('');
const newMax = ref<1 | 2>(1);
const newConsecutive = ref(false);
const addError = ref('');

const className = (id: string) => props.lookup.classGroups.get(id)?.name ?? 'Turma fora da grade';
const subjectName = (id: string) =>
  props.lookup.sortedSubjects().find((s) => s.id === id)?.name ?? 'Disciplina removida';

function add() {
  addError.value = '';
  if (!newClass.value || !newSubject.value) {
    addError.value = 'Escolha a turma e a disciplina da exceção.';
    return;
  }
  if (
    draft.value.dailyExceptions.some(
      (e) => e.classGroupId === newClass.value && e.subjectId === newSubject.value,
    )
  ) {
    addError.value = 'Já existe uma exceção para esta turma e disciplina.';
    return;
  }
  draft.value.dailyExceptions = [
    ...draft.value.dailyExceptions,
    {
      classGroupId: newClass.value,
      subjectId: newSubject.value,
      maxPerDay: newMax.value,
      consecutive: newMax.value === 2 && newConsecutive.value,
    },
  ];
  newClass.value = '';
  newSubject.value = '';
}
function save() {
  emit('save', structuredClone(toRaw(draft.value)));
}
function remove(index: number) {
  draft.value.dailyExceptions = draft.value.dailyExceptions.filter((_, i) => i !== index);
}
</script>

<template>
  <details class="card grid-panel">
    <summary><h2 class="inline-heading">Regras da grade</h2></summary>
    <form class="stack-form" @submit.prevent="save">
      <fieldset class="checks" :disabled="!editable">
        <legend>Onde a hora-atividade pode ser cumprida</legend>
        <label class="check"
          ><input v-model="draft.planningPeriods" type="radio" value="any_shift" /> Em qualquer aula
          dos turnos da grade</label
        >
        <label class="check"
          ><input v-model="draft.planningPeriods" type="radio" value="teaching_shifts" /> Somente
          nos turnos em que o professor tem aulas</label
        >
      </fieldset>
      <fieldset class="checks" :disabled="!editable">
        <legend>Limite diário de cada disciplina na turma</legend>
        <label for="grid-daily-max">Aulas por dia</label>
        <select id="grid-daily-max" v-model.number="draft.daily.maxPerDay">
          <option :value="1">No máximo 1</option>
          <option :value="2">No máximo 2</option>
        </select>
        <label class="check"
          ><input
            v-model="draft.daily.consecutive"
            type="checkbox"
            :disabled="draft.daily.maxPerDay === 1"
          />
          Duas aulas no mesmo dia precisam ser consecutivas (geminadas)</label
        >
      </fieldset>
      <fieldset class="checks" :disabled="!editable">
        <legend>Exceções por turma e disciplina</legend>
        <p v-if="draft.dailyExceptions.length === 0" class="muted">Nenhuma exceção.</p>
        <ul v-else class="list" aria-label="Exceções do limite diário">
          <li
            v-for="(item, index) in draft.dailyExceptions"
            :key="item.classGroupId + item.subjectId"
            class="item"
          >
            <span class="item-name"
              >{{ className(item.classGroupId) }} · {{ subjectName(item.subjectId) }}: até
              {{ item.maxPerDay }} por dia{{ item.consecutive ? ', consecutivas' : '' }}</span
            >
            <button
              type="button"
              class="small ghost"
              :aria-label="
                'Remover exceção de ' +
                className(item.classGroupId) +
                ' em ' +
                subjectName(item.subjectId)
              "
              @click="remove(index)"
            >
              Remover
            </button>
          </li>
        </ul>
        <label for="grid-exception-class">Turma da exceção</label>
        <select id="grid-exception-class" v-model="newClass">
          <option value="">Escolha…</option>
          <option v-for="c in lookup.sortedClassGroups()" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select>
        <label for="grid-exception-subject">Disciplina da exceção</label>
        <select id="grid-exception-subject" v-model="newSubject">
          <option value="">Escolha…</option>
          <option v-for="s in lookup.sortedSubjects()" :key="s.id" :value="s.id">
            {{ s.name }}
          </option>
        </select>
        <label for="grid-exception-max">Aulas por dia na exceção</label>
        <select id="grid-exception-max" v-model.number="newMax">
          <option :value="1">No máximo 1</option>
          <option :value="2">No máximo 2</option>
        </select>
        <label class="check"
          ><input v-model="newConsecutive" type="checkbox" :disabled="newMax === 1" /> Consecutivas
          na exceção</label
        >
        <p v-if="addError" role="alert" class="error">{{ addError }}</p>
        <div class="actions"><button type="button" @click="add">Adicionar exceção</button></div>
      </fieldset>
      <p class="muted">
        Salvar as regras exige conferir novamente as regras e cargas da revisão em Planejamentos.
      </p>
      <div v-if="editable" class="actions">
        <button :disabled="busy">Salvar regras</button>
      </div>
    </form>
  </details>
</template>
