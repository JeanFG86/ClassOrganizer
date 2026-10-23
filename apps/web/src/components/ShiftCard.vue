<script setup lang="ts">
import type { ClassGroupDto, ShiftDto } from '@classorganizer/contracts';
import { computed, nextTick, ref } from 'vue';
import { classGroupsApiKey } from '../services/class-groups-api.ts';
import { errorMessage, isOutdatedError } from '../services/feedback.ts';
import { injectRequired } from '../services/inject-required.ts';
import { compareNames } from '../services/names.ts';
import {
  describeGap,
  draftsFrom,
  gapMinutes,
  ordinal,
  periodInputs,
  type PeriodDraft,
} from '../services/periods.ts';
import { shiftsApiKey } from '../services/shifts-api.ts';
import PeriodsEditor from './PeriodsEditor.vue';

/** Um turno ativo: as aulas do dia e as turmas que usam cada aula. */
const props = defineProps<{
  shift: ShiftDto;
  /** Todas as turmas ativas, de qualquer turno. */
  classGroups: ClassGroupDto[];
  /** Nome de cada turno, para indicar de onde vem uma turma que muda de turno. */
  shiftNames: Record<string, string>;
}>();

/** Algo mudou no servidor; a página recarrega e mostra `message` se houver. */
const emit = defineEmits<{ changed: [message?: string] }>();

const shiftsApi = injectRequired(shiftsApiKey);
const classGroupsApi = injectRequired(classGroupsApiKey);

const busy = ref(false);
const error = ref('');
const editing = ref(false);
const draftName = ref('');
const draftPeriods = ref<PeriodDraft[]>([]);
const classToAdd = ref('');

const byName = (a: ClassGroupDto, b: ClassGroupDto) => compareNames(a.name, b.name);
const prefix = computed(() => `shift-${props.shift.id}`);
const periods = computed(() => props.shift.periods);
const summary = computed(() => {
  const first = periods.value[0];
  const last = periods.value.at(-1);
  const count = periods.value.length;
  const label = count === 1 ? '1 aula' : `${count} aulas`;
  return first && last ? `${label} · ${first.start}–${last.end}` : label;
});
const members = computed(() =>
  props.classGroups.filter((c) => c.shiftId === props.shift.id).toSorted(byName),
);
const candidates = computed(() =>
  props.classGroups.filter((c) => c.shiftId !== props.shift.id).toSorted(byName),
);

function candidateLabel(classGroup: ClassGroupDto): string {
  const from = classGroup.shiftId ? props.shiftNames[classGroup.shiftId] : undefined;
  return from ? `${classGroup.name} (turno atual: ${from})` : classGroup.name;
}

/** Executa uma alteração; dados desatualizados fazem a página recarregar. */
async function run(action: () => Promise<string | undefined>): Promise<boolean> {
  error.value = '';
  busy.value = true;
  try {
    emit('changed', await action());
    return true;
  } catch (e) {
    error.value = errorMessage(e);
    if (isOutdatedError(e)) {
      editing.value = false;
      emit('changed');
    }
    return false;
  } finally {
    busy.value = false;
  }
}

async function startEdit(): Promise<void> {
  error.value = '';
  draftName.value = props.shift.name;
  draftPeriods.value = draftsFrom(props.shift.periods);
  editing.value = true;
  await nextTick();
  document.getElementById(`${prefix.value}-name`)?.focus();
}

async function saveEdit(): Promise<void> {
  const inputs = periodInputs(draftPeriods.value);
  if (typeof inputs === 'string') {
    error.value = inputs;
    return;
  }
  const saved = await run(async () => {
    const updated = await shiftsApi.update(props.shift.id, {
      name: draftName.value,
      periods: inputs,
      version: props.shift.version,
    });
    return `Turno "${updated.name}" salvo.`;
  });
  if (saved) {
    editing.value = false;
  }
}

function archive(): Promise<boolean> {
  return run(async () => {
    await shiftsApi.archive(props.shift.id, props.shift.version);
    return `Turno "${props.shift.name}" arquivado.`;
  });
}

function schedule(classGroup: ClassGroupDto, periodIds: string[]): Promise<boolean> {
  return run(async () => {
    await classGroupsApi.changeSchedule(classGroup.id, {
      shiftId: periodIds.length > 0 ? props.shift.id : null,
      periodIds,
      version: classGroup.version,
    });
    return undefined;
  });
}

async function addClassGroup(): Promise<void> {
  const classGroup = props.classGroups.find((c) => c.id === classToAdd.value);
  if (!classGroup) {
    error.value = 'Escolha a turma.';
    return;
  }
  // Começa com todas as aulas; a secretaria desmarca as que a turma não tem.
  if (
    await schedule(
      classGroup,
      periods.value.map((p) => p.id),
    )
  ) {
    classToAdd.value = '';
  }
}

async function toggle(classGroup: ClassGroupDto, periodId: string, event: Event): Promise<void> {
  const checkbox = event.target as HTMLInputElement;
  const chosen = checkbox.checked
    ? [...classGroup.periodIds, periodId]
    : classGroup.periodIds.filter((id) => id !== periodId);
  if (chosen.length === 0) {
    checkbox.checked = true;
    error.value =
      `A turma ${classGroup.name} precisa ter pelo menos uma aula. ` +
      'Para tirá-la do turno, use “Tirar do turno”.';
    return;
  }
  const order = periods.value.map((p) => p.id);
  if (
    !(await schedule(
      classGroup,
      order.filter((id) => chosen.includes(id)),
    ))
  ) {
    checkbox.checked = !checkbox.checked;
  }
}

const periodTitle = (index: number) => {
  const period = periods.value[index];
  return period ? `${ordinal(index)} aula (${period.start}–${period.end})` : '';
};
</script>

<template>
  <section class="card shift" :aria-labelledby="`${prefix}-title`">
    <div class="shift-header">
      <h2 :id="`${prefix}-title`" class="group-title">{{ shift.name }}</h2>
      <span class="muted">{{ summary }}</span>
      <span v-if="!editing" class="item-actions">
        <button
          type="button"
          class="small ghost"
          :aria-label="`Editar o turno ${shift.name}`"
          :disabled="busy"
          @click="startEdit"
        >
          Editar
        </button>
        <button
          type="button"
          class="small ghost"
          :aria-label="`Arquivar o turno ${shift.name}`"
          :disabled="busy"
          @click="archive"
        >
          Arquivar
        </button>
      </span>
    </div>

    <form v-if="editing" novalidate @submit.prevent="saveEdit" @keydown.esc="editing = false">
      <label :for="`${prefix}-name`">Nome do turno</label>
      <input :id="`${prefix}-name`" v-model="draftName" maxlength="40" autocomplete="off" />
      <PeriodsEditor v-model="draftPeriods" :id-prefix="`${prefix}-edit`" />
      <div class="form-actions">
        <button type="submit" :disabled="busy">{{ busy ? 'Salvando…' : 'Salvar' }}</button>
        <button type="button" class="ghost" @click="editing = false">Cancelar</button>
      </div>
    </form>
    <table v-else class="table" :aria-label="`Aulas do turno ${shift.name}`">
      <tbody>
        <template v-for="(period, index) in periods" :key="period.id">
          <tr v-if="index > 0 && gapMinutes(periods[index - 1] ?? period, period) > 0">
            <td colspan="2" class="muted gap">
              {{ describeGap(gapMinutes(periods[index - 1] ?? period, period)) }}
            </td>
          </tr>
          <tr>
            <th scope="row">{{ ordinal(index) }} aula</th>
            <td>{{ period.start }} às {{ period.end }}</td>
          </tr>
        </template>
      </tbody>
    </table>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <h3 class="form-title">Turmas</h3>
    <p v-if="members.length === 0" class="muted">Nenhuma turma neste turno ainda.</p>
    <div v-else class="matrix-wrapper">
      <table class="table matrix" :aria-label="`Aulas de cada turma do turno ${shift.name}`">
        <thead>
          <tr>
            <th scope="col">Turma</th>
            <th v-for="(period, index) in periods" :key="period.id" scope="col">
              <abbr :title="periodTitle(index)">{{ ordinal(index) }}</abbr>
            </th>
            <th scope="col"><span class="visually-hidden">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="classGroup in members" :key="classGroup.id">
            <th scope="row">
              {{ classGroup.name }}
              <span class="muted">({{ classGroup.periodIds.length }})</span>
            </th>
            <td v-for="(period, index) in periods" :key="period.id">
              <input
                type="checkbox"
                :checked="classGroup.periodIds.includes(period.id)"
                :aria-label="`${classGroup.name}: ${periodTitle(index)}`"
                :disabled="busy"
                @change="toggle(classGroup, period.id, $event)"
              />
            </td>
            <td class="actions">
              <button
                type="button"
                class="small ghost"
                :aria-label="`Tirar ${classGroup.name} do turno`"
                :disabled="busy"
                @click="schedule(classGroup, [])"
              >
                Tirar do turno
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <form
      v-if="candidates.length > 0"
      class="row add-class"
      novalidate
      @submit.prevent="addClassGroup"
    >
      <label :for="`${prefix}-add`" class="visually-hidden">Turma para adicionar ao turno</label>
      <select :id="`${prefix}-add`" v-model="classToAdd">
        <option value="">Adicionar turma…</option>
        <option v-for="classGroup in candidates" :key="classGroup.id" :value="classGroup.id">
          {{ candidateLabel(classGroup) }}
        </option>
      </select>
      <button type="submit" class="small" :disabled="busy">Adicionar</button>
    </form>
  </section>
</template>
