<script setup lang="ts">
import { useAccess } from '../../../access/presentation/session-store.ts';
import type { SubjectDto, TeacherDto } from '@classorganizer/contracts';
import { computed, nextTick, onMounted, ref } from 'vue';
import {
  errorMessage,
  isOutdatedError,
  type Feedback,
} from '../../../../shared/presentation/feedback.ts';
import { injectRequired } from '../../../../shared/presentation/inject-required.ts';
import { subjectsApiKey } from '../../../school-structure/presentation/subjects-key.ts';
import { teachersApiKey } from '../teachers-key.ts';

const { canWrite } = useAccess();
const subjectsApi = injectRequired(subjectsApiKey);
const teachersApi = injectRequired(teachersApiKey);

type LoadState = 'loading' | 'ready' | 'error';

const subjects = ref<SubjectDto[]>([]);
const teachers = ref<TeacherDto[]>([]);
const loadState = ref<LoadState>('loading');
const loadError = ref('');

const activeTeachers = computed(() => teachers.value.filter((t) => t.archivedAt === null));
const archivedTeachers = computed(() => teachers.value.filter((t) => t.archivedAt !== null));
const subjectById = computed(() => new Map(subjects.value.map((s) => [s.id, s])));

/** Professor em edição no formulário; `null` quando o formulário cadastra um novo. */
const editing = ref<TeacherDto | null>(null);
const name = ref('');
const selectedSubjectIds = ref<string[]>([]);
/** Campos numéricos como texto: vazio na carga máxima significa "sem limite". */
const maxWeeklyLessons = ref('');
const planningPeriods = ref('');
const saving = ref(false);
const formFeedback = ref<Feedback | null>(null);
const listFeedback = ref<Feedback | null>(null);
const busy = ref(false);

/**
 * Disciplinas oferecidas no formulário: as ativas e, na edição, as arquivadas em que o
 * professor já é habilitado (podem ser mantidas, mas não acrescentadas).
 */
const subjectOptions = computed(() =>
  subjects.value
    .filter((s) => s.archivedAt === null || editing.value?.subjectIds.includes(s.id))
    .map((s) => ({ id: s.id, label: s.archivedAt ? `${s.name} (arquivada)` : s.name })),
);

function subjectNames(teacher: TeacherDto): string {
  const names = teacher.subjectIds.map((id) => {
    const subject = subjectById.value.get(id);
    if (!subject) return '(removida)';
    return subject.archivedAt ? `${subject.name} (arquivada)` : subject.name;
  });
  return names.length > 0 ? names.join(', ') : 'Sem habilitações';
}

function workloadText(teacher: TeacherDto): string {
  const parts = [];
  if (teacher.maxWeeklyLessons !== null) {
    parts.push(`até ${teacher.maxWeeklyLessons} aulas`);
  }
  if (teacher.planningPeriods > 0) {
    parts.push(`${teacher.planningPeriods} de hora-atividade`);
  }
  return parts.join(' · ');
}

/** Converte os campos de carga; texto inválido vira NaN e o servidor explica a regra. */
function workloadInput(): { maxWeeklyLessons: number | null; planningPeriods: number } {
  const max = String(maxWeeklyLessons.value).trim();
  const planning = String(planningPeriods.value).trim();
  return {
    maxWeeklyLessons: max === '' ? null : Number(max),
    planningPeriods: planning === '' ? 0 : Number(planning),
  };
}

async function load(): Promise<void> {
  loadState.value = 'loading';
  await refresh();
}

/** Atualiza as listas sem voltar ao estado "carregando". */
async function refresh(): Promise<void> {
  try {
    const [subjectList, teacherList] = await Promise.all([subjectsApi.list(), teachersApi.list()]);
    subjects.value = subjectList;
    teachers.value = teacherList;
    loadState.value = 'ready';
  } catch (error) {
    loadError.value = errorMessage(error);
    loadState.value = 'error';
  }
}

function clearFeedback(): void {
  formFeedback.value = null;
  listFeedback.value = null;
}

function resetForm(): void {
  editing.value = null;
  name.value = '';
  selectedSubjectIds.value = [];
  maxWeeklyLessons.value = '';
  planningPeriods.value = '';
}

async function startEdit(teacher: TeacherDto): Promise<void> {
  clearFeedback();
  editing.value = teacher;
  name.value = teacher.name;
  selectedSubjectIds.value = [...teacher.subjectIds];
  maxWeeklyLessons.value =
    teacher.maxWeeklyLessons === null ? '' : String(teacher.maxWeeklyLessons);
  planningPeriods.value = teacher.planningPeriods === 0 ? '' : String(teacher.planningPeriods);
  await nextTick();
  const input = document.getElementById('teacher-name');
  input?.scrollIntoView?.({ block: 'center' });
  input?.focus();
}

function cancelEdit(): void {
  clearFeedback();
  resetForm();
}

async function submit(): Promise<void> {
  clearFeedback();
  if (name.value.trim() === '') {
    formFeedback.value = { kind: 'error', text: 'Informe o nome do professor.' };
    return;
  }

  saving.value = true;
  const input = { name: name.value, subjectIds: selectedSubjectIds.value, ...workloadInput() };
  try {
    if (editing.value) {
      const updated = await teachersApi.update(editing.value.id, {
        ...input,
        version: editing.value.version,
      });
      formFeedback.value = {
        kind: 'success',
        text: `Professor(a) "${updated.name}" atualizado(a).`,
      };
    } else {
      const created = await teachersApi.register(input);
      formFeedback.value = {
        kind: 'success',
        text: `Professor(a) "${created.name}" cadastrado(a).`,
      };
    }
    resetForm();
    await refresh();
  } catch (error) {
    formFeedback.value = { kind: 'error', text: errorMessage(error) };
    if (isOutdatedError(error)) {
      resetForm();
      await refresh();
    }
  } finally {
    saving.value = false;
  }
}

async function runListAction(action: () => Promise<string>): Promise<void> {
  clearFeedback();
  busy.value = true;
  try {
    listFeedback.value = { kind: 'success', text: await action() };
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

function archive(teacher: TeacherDto): Promise<void> {
  if (editing.value?.id === teacher.id) {
    resetForm();
  }
  return runListAction(async () => {
    await teachersApi.archive(teacher.id, teacher.version);
    return `Professor(a) "${teacher.name}" arquivado(a).`;
  });
}

function restore(teacher: TeacherDto): Promise<void> {
  return runListAction(async () => {
    await teachersApi.restore(teacher.id, teacher.version);
    return `Professor(a) "${teacher.name}" restaurado(a).`;
  });
}

onMounted(load);
</script>

<template>
  <section aria-labelledby="teachers-title">
    <h1 id="teachers-title">Professores</h1>

    <p v-if="loadState === 'loading'" role="status">Carregando professores…</p>
    <div v-else-if="loadState === 'error'" role="alert">
      <p class="error">{{ loadError }}</p>
      <button type="button" @click="load">Tentar novamente</button>
    </div>

    <template v-else>
      <form
        v-if="canWrite"
        class="card"
        novalidate
        aria-labelledby="teacher-form-title"
        @submit.prevent="submit"
        @keydown.esc="editing && cancelEdit()"
      >
        <h2 id="teacher-form-title" class="form-title">
          {{ editing ? `Editar professor: ${editing.name}` : 'Novo professor' }}
        </h2>
        <label for="teacher-name">Nome do professor</label>
        <input
          id="teacher-name"
          v-model="name"
          name="name"
          maxlength="120"
          autocomplete="off"
          :aria-invalid="formFeedback?.kind === 'error'"
          :aria-describedby="formFeedback?.kind === 'error' ? 'teacher-form-error' : undefined"
        />

        <fieldset class="checks">
          <legend>Disciplinas que pode lecionar</legend>
          <p v-if="subjectOptions.length === 0" class="hint">
            Nenhuma disciplina cadastrada.
            <RouterLink to="/disciplinas">Cadastre as disciplinas</RouterLink> para habilitar
            professores.
          </p>
          <label v-for="option in subjectOptions" :key="option.id" class="check">
            <input v-model="selectedSubjectIds" type="checkbox" :value="option.id" />
            {{ option.label }}
          </label>
        </fieldset>

        <div class="grid-form">
          <div>
            <label for="teacher-max-lessons">Carga máxima (aulas por semana)</label>
            <input
              id="teacher-max-lessons"
              v-model="maxWeeklyLessons"
              type="number"
              min="1"
              max="60"
              inputmode="numeric"
              aria-describedby="teacher-max-lessons-hint"
            />
            <p id="teacher-max-lessons-hint" class="hint">Em branco: sem limite.</p>
          </div>
          <div>
            <label for="teacher-planning">Hora-atividade (aulas por semana)</label>
            <input
              id="teacher-planning"
              v-model="planningPeriods"
              type="number"
              min="0"
              max="40"
              inputmode="numeric"
              aria-describedby="teacher-planning-hint"
            />
            <p id="teacher-planning-hint" class="hint">Tempo de planejamento, sem turma.</p>
          </div>
        </div>

        <div class="form-actions">
          <button type="submit" :disabled="saving || !canWrite">
            {{ saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar professor' }}
          </button>
          <button v-if="editing" type="button" class="ghost" @click="cancelEdit">
            Cancelar edição
          </button>
        </div>
        <p v-if="formFeedback?.kind === 'error'" id="teacher-form-error" class="error" role="alert">
          {{ formFeedback.text }}
        </p>
        <p v-if="formFeedback?.kind === 'success'" class="success" role="status">
          {{ formFeedback.text }}
        </p>
      </form>

      <h2>Cadastrados</h2>
      <p v-if="listFeedback?.kind === 'error'" class="error" role="alert">
        {{ listFeedback.text }}
      </p>
      <p v-if="listFeedback?.kind === 'success'" class="success" role="status">
        {{ listFeedback.text }}
      </p>
      <p v-if="activeTeachers.length === 0">Nenhum professor cadastrado ainda.</p>
      <ul v-else class="list" aria-label="Professores cadastrados">
        <li v-for="teacher in activeTeachers" :key="teacher.id" class="item">
          <span class="item-name">
            <strong>{{ teacher.name }}</strong>
            <span class="muted"> — {{ subjectNames(teacher) }}</span>
            <span v-if="workloadText(teacher)" class="item-detail muted">
              · {{ workloadText(teacher) }}
            </span>
          </span>
          <span class="item-actions">
            <RouterLink
              class="button small ghost"
              :to="{ path: '/disponibilidade', query: { professor: teacher.id } }"
              :aria-label="`Disponibilidade de ${teacher.name}`"
            >
              Disponibilidade
            </RouterLink>
            <button
              type="button"
              class="small ghost"
              :aria-label="`Editar ${teacher.name}`"
              :disabled="busy || saving || !canWrite"
              @click="startEdit(teacher)"
            >
              Editar
            </button>
            <button
              type="button"
              class="small ghost"
              :aria-label="`Arquivar ${teacher.name}`"
              :disabled="busy || saving || !canWrite"
              @click="archive(teacher)"
            >
              Arquivar
            </button>
          </span>
        </li>
      </ul>

      <section v-if="archivedTeachers.length > 0" aria-labelledby="archived-teachers-title">
        <h2 id="archived-teachers-title">Arquivados ({{ archivedTeachers.length }})</h2>
        <ul class="list" aria-label="Professores arquivados">
          <li v-for="teacher in archivedTeachers" :key="teacher.id" class="item">
            <span class="item-name muted">{{ teacher.name }}</span>
            <span class="item-actions">
              <button
                type="button"
                class="small ghost"
                :aria-label="`Restaurar ${teacher.name}`"
                :disabled="busy || saving || !canWrite"
                @click="restore(teacher)"
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
