<script setup lang="ts">
import { GRID_WEEKDAYS, placementKey, type GridItem, type GridRow } from '../services/grid-view.ts';

const props = defineProps<{
  label: string;
  rows: GridRow[];
  cell: (weekday: number, periodId: string) => { items: GridItem[]; unavailable: boolean };
  /** Descrição completa da alocação para leitores de tela. */
  describe: (item: GridItem) => string;
  hasProblem: (item: GridItem) => boolean;
  selectedKey: string | null;
  interactive: boolean;
}>();
const emit = defineEmits<{
  pick: [item: GridItem];
  empty: [weekday: number, periodId: string];
}>();

function itemLabel(item: GridItem): string {
  const flags = [
    item.placement.pinned ? 'fixada' : '',
    props.hasProblem(item) ? 'com problema' : '',
    props.selectedKey === placementKey(item.placement) ? 'selecionada' : '',
  ].filter(Boolean);
  return props.describe(item) + (flags.length ? ' (' + flags.join(', ') + ')' : '');
}
</script>

<template>
  <div class="matrix-wrapper">
    <table class="table matrix grid-matrix" :aria-label="label">
      <thead>
        <tr>
          <th scope="col">Aula</th>
          <th v-for="day in GRID_WEEKDAYS" :key="day.value" scope="col">
            <abbr :title="day.long">{{ day.short }}</abbr>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.periodId">
          <th scope="row">
            {{ row.label }} <span class="muted grid-time">{{ row.time }}</span>
          </th>
          <td
            v-for="day in GRID_WEEKDAYS"
            :key="day.value"
            :class="{ 'grid-unavailable': cell(day.value, row.periodId).unavailable }"
          >
            <template
              v-for="item in cell(day.value, row.periodId).items"
              :key="placementKey(item.placement)"
            >
              <button
                v-if="interactive"
                type="button"
                class="grid-item"
                :class="{
                  conflict: hasProblem(item),
                  selected: selectedKey === placementKey(item.placement),
                }"
                :aria-pressed="selectedKey === placementKey(item.placement)"
                :aria-label="itemLabel(item)"
                @click="emit('pick', item)"
              >
                <span class="grid-item-title">{{ item.title }}</span>
                <span class="grid-item-detail">{{ item.detail }}</span>
                <span class="grid-flags" aria-hidden="true"
                  >{{ item.placement.pinned ? '📌' : '' }}{{ hasProblem(item) ? '⚠' : '' }}</span
                >
              </button>
              <div
                v-else
                class="grid-item"
                :class="{ conflict: hasProblem(item) }"
                :aria-label="itemLabel(item)"
                role="img"
              >
                <span class="grid-item-title">{{ item.title }}</span>
                <span class="grid-item-detail">{{ item.detail }}</span>
                <span class="grid-flags" aria-hidden="true"
                  >{{ item.placement.pinned ? '📌' : '' }}{{ hasProblem(item) ? '⚠' : '' }}</span
                >
              </div>
            </template>
            <template v-if="cell(day.value, row.periodId).items.length === 0">
              <button
                v-if="interactive"
                type="button"
                class="grid-empty"
                :aria-label="
                  'Horário livre: ' +
                  day.long +
                  ', ' +
                  row.label +
                  ' aula (' +
                  row.time +
                  ')' +
                  (cell(day.value, row.periodId).unavailable ? ', professor indisponível' : '')
                "
                @click="emit('empty', day.value, row.periodId)"
              >
                {{ cell(day.value, row.periodId).unavailable ? 'Indisponível' : 'Livre' }}
              </button>
              <span v-else class="muted grid-empty-text">{{
                cell(day.value, row.periodId).unavailable ? 'Indisponível' : '—'
              }}</span>
            </template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
