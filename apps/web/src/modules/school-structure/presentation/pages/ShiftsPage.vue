<script setup lang="ts">
import { useAccess } from '../../../access/presentation/session-store.ts';
import type { ClassGroupDto, ShiftDto } from '@classorganizer/contracts';
import { computed, onMounted, ref } from 'vue';
import PeriodsEditor from '../components/PeriodsEditor.vue';
import ShiftCard from '../components/ShiftCard.vue';
import { classGroupsApiKey } from '../class-groups-key.ts';
import {
  errorMessage,
  isOutdatedError,
  type Feedback,
} from '../../../../shared/presentation/feedback.ts';
import { injectRequired } from '../../../../shared/presentation/inject-required.ts';
import { compareNames } from '../../../../shared/presentation/names.ts';
import {
  nextPeriodDraft,
  periodInputs,
  type PeriodDraft,
} from '../../../../shared/presentation/periods.ts';
import { shiftsApiKey } from '../shifts-key.ts';

const { canWrite } = useAccess();
const shiftsApi = injectRequired(shiftsApiKey);
const classGroupsApi = injectRequired(classGroupsApiKey);

type LoadState = 'loading' | 'ready' | 'error';

const shifts = ref<ShiftDto[]>([]);
const classGroups = ref<ClassGroupDto[]>([]);
const loadState = ref<LoadState>('loading');
const loadError = ref('');

const activeShifts = computed(() => shifts.value.filter((s) => s.archivedAt === null));
const archivedShifts = computed(() => shifts.value.filter((s) => s.archivedAt !== null));
const activeClassGroups = computed(() => classGroups.value.filter((c) => c.archivedAt === null));
const withoutShift = computed(() =>
  activeClassGroups.value
    .filter((c) => c.shiftId === null)
    .toSorted((a, b) => compareNames(a.name, b.name)),
);
const shiftNames = computed(() => Object.fromEntries(shifts.value.map((s) => [s.id, s.name])));

const name = ref('');
const periods = ref<PeriodDraft[]>([nextPeriodDraft([])]);
const saving = ref(false);
const formFeedback = ref<Feedback | null>(null);
const listFeedback = ref<Feedback | null>(null);
const busy = ref(false);

async function load(): Promise<void> {
  loadState.value = 'loading';
  await refresh();
}

/** Atualiza turnos e turmas sem voltar ao estado "carregando". */
async function refresh(): Promise<void> {
  try {
    [shifts.value, classGroups.value] = await Promise.all([
      shiftsApi.list(),
      classGroupsApi.list(),
    ]);
    loadState.value = 'ready';
  } catch (error) {
    loadError.value = errorMessage(error);
    loadState.value = 'error';
  }
}

async function onChanged(message?: string): Promise<void> {
  formFeedback.value = null;
  listFeedback.value = message ? { kind: 'success', text: message } : null;
  await refresh();
}

async function submit(): Promise<void> {
  formFeedback.value = null;
  listFeedback.value = null;
  if (name.value.trim() === '') {
    formFeedback.value = { kind: 'error', text: 'Informe o nome do turno.' };
    return;
  }
  const inputs = periodInputs(periods.value);
  if (typeof inputs === 'string') {
    formFeedback.value = { kind: 'error', text: inputs };
    return;
  }

  saving.value = true;
  try {
    const created = await shiftsApi.register({ name: name.value, periods: inputs });
    formFeedback.value = { kind: 'success', text: `Turno "${created.name}" cadastrado.` };
    name.value = '';
    periods.value = [nextPeriodDraft([])];
    await refresh();
  } catch (error) {
    formFeedback.value = { kind: 'error', text: errorMessage(error) };
  } finally {
    saving.value = false;
  }
}

async function restore(shift: ShiftDto): Promise<void> {
  formFeedback.value = null;
  busy.value = true;
  try {
    await shiftsApi.restore(shift.id, shift.version);
    listFeedback.value = { kind: 'success', text: `Turno "${shift.name}" restaurado.` };
    await refresh();
  } catch (error) {
    listFeedback.value = { kind: 'error', text: errorMessage(error) };
    if (isOutdatedError(error)) {
      await refresh();
    }
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section aria-labelledby="shifts-page-title">
    <h1 id="shifts-page-title">Turnos e horários</h1>
    <p>
      Cadastre os turnos com o horário de cada aula. Depois, em cada turno, marque as aulas que cada
      turma tem: turmas do mesmo turno podem ter quantidades diferentes de aulas.
    </p>

    <form v-if="canWrite" class="card" novalidate @submit.prevent="submit">
      <h2 class="form-title">Novo turno</h2>
      <label for="shift-name">Nome do turno</label>
      <input
        id="shift-name"
        v-model="name"
        maxlength="40"
        autocomplete="off"
        placeholder="Ex.: Manhã"
        :aria-invalid="formFeedback?.kind === 'error'"
        :aria-describedby="formFeedback?.kind === 'error' ? 'shift-form-error' : undefined"
      />
      <PeriodsEditor v-model="periods" id-prefix="new-shift" />
      <button type="submit" :disabled="saving || !canWrite">
        {{ saving ? 'Salvando…' : 'Cadastrar turno' }}
      </button>
      <p v-if="formFeedback?.kind === 'error'" id="shift-form-error" class="error" role="alert">
        {{ formFeedback.text }}
      </p>
      <p v-if="formFeedback?.kind === 'success'" class="success" role="status">
        {{ formFeedback.text }}
      </p>
    </form>

    <p v-if="listFeedback?.kind === 'error'" class="error" role="alert">{{ listFeedback.text }}</p>
    <p v-if="listFeedback?.kind === 'success'" class="success" role="status">
      {{ listFeedback.text }}
    </p>

    <p v-if="loadState === 'loading'" role="status">Carregando turnos…</p>
    <div v-else-if="loadState === 'error'" role="alert">
      <p class="error">{{ loadError }}</p>
      <button type="button" @click="load">Tentar novamente</button>
    </div>
    <template v-else>
      <p v-if="activeShifts.length === 0">Nenhum turno cadastrado ainda.</p>
      <ShiftCard
        v-for="shift in activeShifts"
        :key="shift.id"
        :shift="shift"
        :class-groups="activeClassGroups"
        :shift-names="shiftNames"
        @changed="onChanged"
      />

      <section v-if="withoutShift.length > 0" class="card" aria-labelledby="without-shift-title">
        <h2 id="without-shift-title" class="group-title">
          Turmas sem turno ({{ withoutShift.length }})
        </h2>
        <p class="muted">
          {{
            activeShifts.length > 0
              ? 'Adicione cada turma a um turno, no campo “Adicionar turma” do turno.'
              : 'Cadastre um turno para poder adicionar estas turmas a ele.'
          }}
        </p>
        <p>{{ withoutShift.map((c) => c.name).join(', ') }}</p>
      </section>

      <section v-if="archivedShifts.length > 0" aria-labelledby="archived-shifts-title">
        <h2 id="archived-shifts-title">Arquivados ({{ archivedShifts.length }})</h2>
        <p class="muted">Turnos arquivados não aceitam turmas.</p>
        <ul class="list" aria-label="Turnos arquivados">
          <li v-for="shift in archivedShifts" :key="shift.id" class="item">
            <span class="item-name muted">{{ shift.name }}</span>
            <span class="item-actions">
              <button
                type="button"
                class="small ghost"
                :aria-label="`Restaurar o turno ${shift.name}`"
                :disabled="busy || !canWrite"
                @click="restore(shift)"
              >
                Restaurar
              </button>
            </span>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>
