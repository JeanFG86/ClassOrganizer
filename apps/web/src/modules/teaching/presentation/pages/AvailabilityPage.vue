<script setup lang="ts">
import { useAccess } from '../../../access/index.ts';
import type { AssignmentDto, ShiftDto, TeacherDto } from '@classorganizer/contracts';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { assignmentsApiKey } from '../assignments-key.ts';
import {
  errorMessage,
  isOutdatedError,
  type Feedback,
} from '../../../../shared/presentation/feedback.ts';
import { injectRequired } from '../../../../shared/presentation/inject-required.ts';
import { compareNames } from '../../../../shared/presentation/names.ts';
import { ordinal } from '../../../../shared/presentation/periods.ts';
import { shiftsApiKey } from '../../../school-structure/index.ts';
import { teachersApiKey } from '../teachers-key.ts';

const { canWrite } = useAccess();
const teachersApi = injectRequired(teachersApiKey);
const shiftsApi = injectRequired(shiftsApiKey);
const assignmentsApi = injectRequired(assignmentsApiKey);
const route = useRoute();
const router = useRouter();

const WEEKDAYS = [
  { value: 1, short: 'Seg', long: 'segunda' },
  { value: 2, short: 'Ter', long: 'terça' },
  { value: 3, short: 'Qua', long: 'quarta' },
  { value: 4, short: 'Qui', long: 'quinta' },
  { value: 5, short: 'Sex', long: 'sexta' },
] as const;

type LoadState = 'loading' | 'ready' | 'error';

const teachers = ref<TeacherDto[]>([]);
const shifts = ref<ShiftDto[]>([]);
const assignments = ref<AssignmentDto[]>([]);
const loadState = ref<LoadState>('loading');
const loadError = ref('');

const activeTeachers = computed(() =>
  teachers.value
    .filter((t) => t.archivedAt === null)
    .toSorted((a, b) => compareNames(a.name, b.name)),
);
const activeShifts = computed(() => shifts.value.filter((s) => s.archivedAt === null));

const teacherId = ref('');
const teacher = computed(() => teachers.value.find((t) => t.id === teacherId.value));

/** Horários marcados como indisponíveis na tela, como "dia|aula". */
const draft = ref(new Set<string>());
const saved = computed(
  () => new Set((teacher.value?.unavailable ?? []).map((s) => key(s.weekday, s.periodId))),
);
const dirty = computed(
  () => draft.value.size !== saved.value.size || [...draft.value].some((k) => !saved.value.has(k)),
);
const saving = ref(false);
const feedback = ref<Feedback | null>(null);

const assignedLessons = computed(() =>
  assignments.value
    .filter((a) => a.participants.some((p) => p.teacherId === teacherId.value))
    .reduce((sum, a) => sum + a.weeklyLessons, 0),
);

function key(weekday: number, periodId: string): string {
  return `${weekday}|${periodId}`;
}

function resetDraft(): void {
  draft.value = new Set(saved.value);
}

watch(teacherId, (id) => {
  feedback.value = null;
  resetDraft();
  if (id && route.query['professor'] !== id) {
    void router.replace({ query: { professor: id } });
  }
});

async function load(): Promise<void> {
  loadState.value = 'loading';
  await refresh();
  const requested = route.query['professor'];
  if (typeof requested === 'string' && activeTeachers.value.some((t) => t.id === requested)) {
    teacherId.value = requested;
  }
}

async function refresh(): Promise<void> {
  try {
    [teachers.value, shifts.value, assignments.value] = await Promise.all([
      teachersApi.list(),
      shiftsApi.list(),
      assignmentsApi.list(),
    ]);
    loadState.value = 'ready';
  } catch (error) {
    loadError.value = errorMessage(error);
    loadState.value = 'error';
  }
}

function toggle(weekday: number, periodId: string, unavailable: boolean): void {
  const next = new Set(draft.value);
  if (unavailable) {
    next.add(key(weekday, periodId));
  } else {
    next.delete(key(weekday, periodId));
  }
  draft.value = next;
}

function dayFullyBlocked(shift: ShiftDto, weekday: number): boolean {
  return shift.periods.every((p) => draft.value.has(key(weekday, p.id)));
}

/** Marca o dia inteiro do turno; se já estiver todo marcado, desmarca. */
function toggleDay(shift: ShiftDto, weekday: number): void {
  const block = !dayFullyBlocked(shift, weekday);
  const next = new Set(draft.value);
  for (const period of shift.periods) {
    if (block) {
      next.add(key(weekday, period.id));
    } else {
      next.delete(key(weekday, period.id));
    }
  }
  draft.value = next;
}

async function save(): Promise<void> {
  const current = teacher.value;
  if (!current) return;
  feedback.value = null;
  saving.value = true;
  try {
    const unavailable = [...draft.value].map((k) => {
      const [weekday, periodId] = k.split('|');
      return { weekday: Number(weekday), periodId: periodId ?? '' };
    });
    await teachersApi.changeAvailability(current.id, { unavailable, version: current.version });
    await refresh();
    resetDraft();
    feedback.value = { kind: 'success', text: `Disponibilidade de ${current.name} salva.` };
  } catch (error) {
    feedback.value = { kind: 'error', text: errorMessage(error) };
    if (isOutdatedError(error)) {
      await refresh();
      resetDraft();
    }
  } finally {
    saving.value = false;
  }
}

const cellLabel = (shift: ShiftDto, index: number, weekday: (typeof WEEKDAYS)[number]) => {
  const period = shift.periods[index];
  return period
    ? `Indisponível na ${weekday.long}, ${ordinal(index)} aula da ${shift.name} ` +
        `(${period.start}–${period.end})`
    : '';
};

onMounted(load);
</script>

<template>
  <section aria-labelledby="availability-title">
    <h1 id="availability-title">Disponibilidade dos professores</h1>
    <p>
      Marque os horários em que o professor <strong>não pode</strong> dar aula. Nos demais, ele é
      considerado disponível.
    </p>

    <p v-if="loadState === 'loading'" role="status">Carregando…</p>
    <div v-else-if="loadState === 'error'" role="alert">
      <p class="error">{{ loadError }}</p>
      <button type="button" @click="load">Tentar novamente</button>
    </div>
    <template v-else>
      <div class="card">
        <label for="availability-teacher">Professor</label>
        <select id="availability-teacher" v-model="teacherId">
          <option value="">Escolha o professor…</option>
          <option v-for="t in activeTeachers" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
        <p v-if="teacher" class="hint">
          Aulas atribuídas: {{ assignedLessons
          }}{{
            teacher.maxWeeklyLessons !== null ? ` de no máximo ${teacher.maxWeeklyLessons}` : ''
          }}
          · Hora-atividade: {{ teacher.planningPeriods }} · Indisponível em {{ draft.size }}
          {{ draft.size === 1 ? 'horário' : 'horários' }}
        </p>
      </div>

      <p v-if="activeShifts.length === 0">
        Nenhum turno cadastrado. Cadastre os turnos e os horários das aulas em
        <RouterLink to="/turnos">Turnos e horários</RouterLink>.
      </p>

      <template v-if="teacher && activeShifts.length > 0">
        <section
          v-for="shift in activeShifts"
          :key="shift.id"
          class="card group"
          :aria-labelledby="`availability-shift-${shift.id}`"
        >
          <h2 :id="`availability-shift-${shift.id}`" class="group-title">{{ shift.name }}</h2>
          <table class="table matrix" :aria-label="`Horários indisponíveis na ${shift.name}`">
            <thead>
              <tr>
                <th scope="col">Aula</th>
                <th v-for="weekday in WEEKDAYS" :key="weekday.value" scope="col">
                  <button
                    type="button"
                    class="small ghost day-toggle"
                    :disabled="!canWrite"
                    :aria-pressed="dayFullyBlocked(shift, weekday.value)"
                    :aria-label="`${weekday.long} inteira indisponível na ${shift.name}`"
                    @click="toggleDay(shift, weekday.value)"
                  >
                    {{ weekday.short }}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(period, index) in shift.periods" :key="period.id">
                <th scope="row">
                  {{ ordinal(index) }} <span class="muted">{{ period.start }}</span>
                </th>
                <td v-for="weekday in WEEKDAYS" :key="weekday.value">
                  <input
                    type="checkbox"
                    :disabled="!canWrite"
                    :checked="draft.has(key(weekday.value, period.id))"
                    :aria-label="cellLabel(shift, index, weekday)"
                    @change="
                      toggle(weekday.value, period.id, ($event.target as HTMLInputElement).checked)
                    "
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <div class="form-actions">
          <button type="button" :disabled="saving || !dirty || !canWrite" @click="save">
            {{ saving ? 'Salvando…' : 'Salvar disponibilidade' }}
          </button>
          <button
            type="button"
            class="ghost"
            :disabled="saving || !dirty || !canWrite"
            @click="resetDraft"
          >
            Desfazer alterações
          </button>
        </div>
      </template>

      <p v-if="feedback?.kind === 'error'" class="error" role="alert">{{ feedback.text }}</p>
      <p v-if="feedback?.kind === 'success'" class="success" role="status">{{ feedback.text }}</p>
    </template>
  </section>
</template>
