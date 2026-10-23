<script setup lang="ts">
import {
  describeGap,
  gapMinutes,
  nextPeriodDraft,
  ordinal,
  type PeriodDraft,
} from '../services/periods.ts';

/** Edita a lista de aulas de um turno: início e fim de cada uma, com os intervalos entre elas. */
const props = defineProps<{ idPrefix: string }>();
const periods = defineModel<PeriodDraft[]>({ required: true });

function setTime(index: number, field: 'start' | 'end', value: string): void {
  periods.value = periods.value.map((p, i) => (i === index ? { ...p, [field]: value } : p));
}

function add(): void {
  periods.value = [...periods.value, nextPeriodDraft(periods.value)];
}

function remove(index: number): void {
  periods.value = periods.value.filter((_, i) => i !== index);
}

const inputId = (index: number, field: 'start' | 'end') => `${props.idPrefix}-${field}-${index}`;
</script>

<template>
  <fieldset class="periods-editor">
    <legend>Aulas do dia</legend>
    <p class="hint">
      Informe o início e o fim de cada aula. Os intervalos são calculados pela diferença entre uma
      aula e a seguinte.
    </p>
    <ol class="period-rows">
      <template v-for="(period, index) in periods" :key="period.key">
        <li
          v-if="index > 0 && gapMinutes(periods[index - 1] ?? period, period) > 0"
          class="gap muted"
          aria-hidden="true"
        >
          {{ describeGap(gapMinutes(periods[index - 1] ?? period, period)) }}
        </li>
        <li class="period-row">
          <span class="period-name">{{ ordinal(index) }} aula</span>
          <label :for="inputId(index, 'start')" class="visually-hidden">
            Início da {{ ordinal(index) }} aula
          </label>
          <input
            :id="inputId(index, 'start')"
            type="time"
            :value="period.start"
            @input="setTime(index, 'start', ($event.target as HTMLInputElement).value)"
          />
          <span aria-hidden="true">às</span>
          <label :for="inputId(index, 'end')" class="visually-hidden">
            Fim da {{ ordinal(index) }} aula
          </label>
          <input
            :id="inputId(index, 'end')"
            type="time"
            :value="period.end"
            @input="setTime(index, 'end', ($event.target as HTMLInputElement).value)"
          />
          <button
            type="button"
            class="small ghost"
            :aria-label="`Remover ${ordinal(index)} aula`"
            @click="remove(index)"
          >
            Remover
          </button>
        </li>
      </template>
    </ol>
    <button type="button" class="small ghost" @click="add">Adicionar aula</button>
  </fieldset>
</template>
