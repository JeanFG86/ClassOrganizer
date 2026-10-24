<script setup lang="ts">
import { computed } from 'vue';
import type { GridViewDto } from '@classorganizer/contracts';
import type { GridLookup } from '../services/grid-view.ts';

const props = defineProps<{ view: GridViewDto; lookup: GridLookup }>();
const diagnosis = computed(() => props.view.diagnosis);
const blocking = computed(() =>
  diagnosis.value.model.length ? diagnosis.value.model : diagnosis.value.problems,
);
const complete = computed(
  () => blocking.value.length === 0 && diagnosis.value.pending.length === 0,
);
const teacherName = (id: string) => props.lookup.teachers.get(id)?.name ?? '?';
const className = (id: string) => props.lookup.classGroups.get(id)?.name ?? '?';
const teacherRows = computed(() =>
  diagnosis.value.teachers.toSorted((a, b) =>
    teacherName(a.teacherId).localeCompare(teacherName(b.teacherId), 'pt-BR'),
  ),
);
const classRows = computed(() =>
  diagnosis.value.classGroups.toSorted((a, b) =>
    className(a.classGroupId).localeCompare(className(b.classGroupId), 'pt-BR'),
  ),
);
</script>

<template>
  <section class="card grid-panel" aria-labelledby="grid-diagnosis-title">
    <h2 id="grid-diagnosis-title">Conferência da grade</h2>
    <p v-if="complete" class="success">
      Grade completa e sem problemas. A revisão pode ser concluída depois das conferências.
    </p>
    <p v-else>
      {{ blocking.length }} {{ blocking.length === 1 ? 'problema' : 'problemas' }} ·
      {{ diagnosis.pending.length }}
      {{ diagnosis.pending.length === 1 ? 'pendência' : 'pendências' }} para completar.
    </p>
    <template v-if="blocking.length">
      <h3>⚠ Problemas</h3>
      <ul class="issue-list" aria-label="Problemas da grade">
        <li v-for="(issue, index) in blocking" :key="index" class="error">{{ issue.message }}</li>
      </ul>
    </template>
    <details v-if="diagnosis.pending.length">
      <summary>O que falta ({{ diagnosis.pending.length }})</summary>
      <ul class="issue-list" aria-label="Pendências da grade">
        <li v-for="(issue, index) in diagnosis.pending" :key="index">{{ issue.message }}</li>
      </ul>
    </details>
    <template v-if="diagnosis.alerts.length">
      <h3>Alertas</h3>
      <ul class="issue-list" aria-label="Alertas da grade">
        <li v-for="(issue, index) in diagnosis.alerts" :key="index">{{ issue.message }}</li>
      </ul>
    </template>
    <p class="muted">
      Recursos especiais ainda não são configurados. As janelas mostram aulas vagas entre duas
      atividades do professor no mesmo turno e dia; não bloqueiam a conclusão, e a geração
      automática pode reduzi-las.
    </p>
    <details>
      <summary>Carga por professor e por turma</summary>
      <div class="matrix-wrapper">
        <table class="table" aria-label="Carga por professor">
          <thead>
            <tr>
              <th scope="col">Professor</th>
              <th scope="col" class="num">Aulas</th>
              <th scope="col" class="num">Hora-atividade</th>
              <th scope="col" class="num">Janelas</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in teacherRows" :key="row.teacherId">
              <th scope="row">{{ teacherName(row.teacherId) }}</th>
              <td class="num">
                {{ row.lessons }} de {{ row.requiredLessons
                }}{{ row.maxWeeklyLessons !== null ? ' (máx. ' + row.maxWeeklyLessons + ')' : '' }}
              </td>
              <td class="num">{{ row.planning }} de {{ row.requiredPlanning }}</td>
              <td class="num">{{ row.windows }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="matrix-wrapper">
        <table class="table" aria-label="Carga por turma">
          <thead>
            <tr>
              <th scope="col">Turma</th>
              <th scope="col" class="num">Aulas</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in classRows" :key="row.classGroupId">
              <th scope="row">{{ className(row.classGroupId) }}</th>
              <td class="num">{{ row.lessons }} de {{ row.requiredLessons }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </section>
</template>
