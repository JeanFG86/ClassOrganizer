<script setup lang="ts">
import type { ClassGroupDto } from '@classorganizer/contracts';
import { onMounted, ref } from 'vue';
import CatalogPage, { type CatalogTexts } from '../components/CatalogPage.vue';
import { classGroupsApiKey } from '../services/class-groups-api.ts';
import { injectRequired } from '../services/inject-required.ts';
import { shiftsApiKey } from '../services/shifts-api.ts';

const api = injectRequired(classGroupsApiKey);
const shiftsApi = injectRequired(shiftsApiKey);

const texts: CatalogTexts = {
  title: 'Turmas',
  noun: 'Turma',
  fieldLabel: 'Nome da turma',
  idPrefix: 'class-group',
  maxLength: 40,
  archivedHint:
    'Não aparecem nas opções de atribuição; as atribuições já feitas continuam registradas.',
};

/** O turno é só informativo aqui; sem a lista de turnos, a página funciona sem ele. */
const shiftNames = ref<Record<string, string>>({});

onMounted(async () => {
  try {
    shiftNames.value = Object.fromEntries((await shiftsApi.list()).map((s) => [s.id, s.name]));
  } catch {
    shiftNames.value = {};
  }
});

function detail(classGroup: ClassGroupDto): string {
  if (classGroup.shiftId === null) {
    return 'sem turno';
  }
  const shift = shiftNames.value[classGroup.shiftId];
  const count = classGroup.periodIds.length;
  return `${shift ?? 'turno'}, ${count} ${count === 1 ? 'aula' : 'aulas'} por dia`;
}
</script>

<template>
  <CatalogPage :api="api" :texts="texts" :detail="detail" />
  <p class="muted">
    O turno e as aulas de cada turma são definidos em
    <RouterLink to="/turnos">Turnos e horários</RouterLink>.
  </p>
</template>
