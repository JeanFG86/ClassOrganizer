<script setup lang="ts">
import type { ResourceDto } from '@classorganizer/contracts';
import { computed } from 'vue';
import { compareNames } from '../services/names.ts';

/** Recursos especiais do bloco (ADR 0016); some da tela quando não há nenhum para escolher. */
const resourceIds = defineModel<string[]>({ required: true });
const props = defineProps<{
  idPrefix: string;
  resources: ResourceDto[];
  disabled: boolean;
}>();

const options = computed(() =>
  props.resources
    .filter((r) => !r.archivedAt || resourceIds.value.includes(r.id))
    .toSorted((a, b) => compareNames(a.name, b.name)),
);
</script>

<template>
  <fieldset v-if="options.length > 0" class="checks" :disabled="disabled">
    <legend>Recursos especiais usados pelo bloco (opcional)</legend>
    <p :id="idPrefix + '-resources-hint'" class="hint">
      Dois blocos com o mesmo recurso não ficam no mesmo horário.
    </p>
    <label v-for="option in options" :key="option.id" class="check">
      <input
        v-model="resourceIds"
        type="checkbox"
        :value="option.id"
        :aria-describedby="idPrefix + '-resources-hint'"
      />
      {{ option.name }}{{ option.archivedAt ? ' (arquivado)' : '' }}
    </label>
  </fieldset>
</template>
