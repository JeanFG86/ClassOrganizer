<script setup lang="ts">
import type {
  AssignmentDto,
  ClassGroupDto,
  SubjectDto,
  TeacherDto,
} from '@classorganizer/contracts';
import { computed, onMounted, ref, watch } from 'vue';
import { assignmentsApiKey } from '../services/assignments-api.ts';
import { classGroupsApiKey } from '../services/class-groups-api.ts';
import { errorMessage, isOutdatedError, type Feedback } from '../services/feedback.ts';
import { injectRequired } from '../services/inject-required.ts';
import { compareNames } from '../services/names.ts';
import { subjectsApiKey } from '../services/subjects-api.ts';
import { teachersApiKey } from '../services/teachers-api.ts';

const assignmentsApi = injectRequired(assignmentsApiKey);
const classGroupsApi = injectRequired(classGroupsApiKey);
const subjectsApi = injectRequired(subjectsApiKey);
const teachersApi = injectRequired(teachersApiKey);

const MAX_WEEKLY_LESSONS = 40;

type LoadState = 'loading' | 'ready' | 'error';

const classGroups = ref<ClassGroupDto[]>([]);
const subjects = ref<SubjectDto[]>([]);
const teachers = ref<TeacherDto[]>([]);
const assignments = ref<AssignmentDto[]>([]);
const loadState = ref<LoadState>('loading');
const loadError = ref('');

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]));
const classGroupById = computed(() => byId(classGroups.value));
const subjectById = computed(() => byId(subjects.value));
const teacherById = computed(() => byId(teachers.value));

const activeClassGroups = computed(() => classGroups.value.filter((c) => !c.archivedAt));
const activeSubjects = computed(() => subjects.value.filter((s) => !s.archivedAt));
const activeTeachers = computed(() => teachers.value.filter((t) => !t.archivedAt));

function classGroupName(id: string): string {
  const classGroup = classGroupById.value.get(id);
  if (!classGroup) return '(removida)';
  return classGroup.archivedAt ? `${classGroup.name} (arquivada)` : classGroup.name;
}

function subjectName(id: string): string {
  const subject = subjectById.value.get(id);
  if (!subject) return '(removida)';
  return subject.archivedAt ? `${subject.name} (arquivada)` : subject.name;
}

function teacherName(id: string): string {
  return teacherById.value.get(id)?.name ?? '(removido)';
}

/** Professores ativos habilitados na disciplina. */
function qualifiedTeachers(subjectId: string): TeacherDto[] {
  return activeTeachers.value.filter((t) => t.subjectIds.includes(subjectId));
}

function lessonsLabel(count: number): string {
  return count === 1 ? '1 aula' : `${count} aulas`;
}

// ---------- Resumos ----------

const groups = computed(() => {
  const result = new Map<string, AssignmentDto[]>();
  for (const assignment of assignments.value) {
    const list = result.get(assignment.classGroupId) ?? [];
    list.push(assignment);
    result.set(assignment.classGroupId, list);
  }
  return [...result.entries()]
    .map(([classGroupId, items]) => ({
      classGroupId,
      name: classGroupName(classGroupId),
      total: items.reduce((sum, a) => sum + a.weeklyLessons, 0),
      items: items.toSorted((a, b) =>
        compareNames(subjectName(a.subjectId), subjectName(b.subjectId)),
      ),
    }))
    .toSorted((a, b) => compareNames(a.name, b.name));
});

const classGroupsWithoutAssignments = computed(() =>
  activeClassGroups.value.filter((c) => !assignments.value.some((a) => a.classGroupId === c.id)),
);

const teacherLoads = computed(() =>
  activeTeachers.value
    .map((teacher) => {
      const own = assignments.value.filter((a) => a.teacherId === teacher.id);
      const total = own.reduce((sum, a) => sum + a.weeklyLessons, 0);
      return {
        id: teacher.id,
        name: teacher.name,
        total,
        max: teacher.maxWeeklyLessons,
        planning: teacher.planningPeriods,
        over: teacher.maxWeeklyLessons !== null && total > teacher.maxWeeklyLessons,
        classGroups: new Set(own.map((a) => a.classGroupId)).size,
      };
    })
    .toSorted((a, b) => compareNames(a.name, b.name)),
);

/** A carga máxima é um alerta, não um bloqueio (ADR 0008). */
const overloaded = computed(() => teacherLoads.value.filter((t) => t.over));

// ---------- Carregamento ----------

async function load(): Promise<void> {
  loadState.value = 'loading';
  await refresh();
}

/** Atualiza tudo sem voltar ao estado "carregando". */
async function refresh(): Promise<void> {
  try {
    const [classGroupList, subjectList, teacherList, assignmentList] = await Promise.all([
      classGroupsApi.list(),
      subjectsApi.list(),
      teachersApi.list(),
      assignmentsApi.list(),
    ]);
    classGroups.value = classGroupList;
    subjects.value = subjectList;
    teachers.value = teacherList;
    assignments.value = assignmentList;
    loadState.value = 'ready';
  } catch (error) {
    loadError.value = errorMessage(error);
    loadState.value = 'error';
  }
}

// ---------- Nova atribuição ----------

const form = ref({ classGroupId: '', subjectId: '', teacherId: '', weeklyLessons: '' });
const saving = ref(false);
const formFeedback = ref<Feedback | null>(null);
const listFeedback = ref<Feedback | null>(null);

/** Disciplinas que já têm professor na turma escolhida. */
const takenSubjectIds = computed(
  () =>
    new Set(
      assignments.value
        .filter((a) => a.classGroupId === form.value.classGroupId)
        .map((a) => a.subjectId),
    ),
);
const formTeachers = computed(() =>
  form.value.subjectId ? qualifiedTeachers(form.value.subjectId) : [],
);

// Trocar a disciplina invalida o professor escolhido se ele não for habilitado nela.
watch(
  () => form.value.subjectId,
  () => {
    if (!formTeachers.value.some((t) => t.id === form.value.teacherId)) {
      form.value.teacherId =
        formTeachers.value.length === 1 ? (formTeachers.value[0]?.id ?? '') : '';
    }
  },
);

function clearFeedback(): void {
  formFeedback.value = null;
  listFeedback.value = null;
}

function parseLessons(raw: string | number): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= MAX_WEEKLY_LESSONS ? value : null;
}

async function submit(): Promise<void> {
  clearFeedback();
  const { classGroupId, subjectId, teacherId } = form.value;
  const weeklyLessons = parseLessons(form.value.weeklyLessons);
  const missing = [
    !classGroupId && 'a turma',
    !subjectId && 'a disciplina',
    !teacherId && 'o professor',
  ].filter(Boolean);
  if (missing.length > 0) {
    formFeedback.value = { kind: 'error', text: `Escolha ${missing.join(', ')}.` };
    return;
  }
  if (weeklyLessons === null) {
    formFeedback.value = {
      kind: 'error',
      text: `Informe um número inteiro de aulas por semana entre 1 e ${MAX_WEEKLY_LESSONS}.`,
    };
    return;
  }

  saving.value = true;
  try {
    await assignmentsApi.create({ classGroupId, subjectId, teacherId, weeklyLessons });
    formFeedback.value = {
      kind: 'success',
      text:
        `${subjectName(subjectId)} em ${classGroupName(classGroupId)} atribuída a ` +
        `${teacherName(teacherId)} (${lessonsLabel(weeklyLessons)} por semana).`,
    };
    // Mantém a turma escolhida para agilizar o lançamento das demais disciplinas.
    form.value = { classGroupId, subjectId: '', teacherId: '', weeklyLessons: '' };
    await refresh();
  } catch (error) {
    formFeedback.value = { kind: 'error', text: errorMessage(error) };
    if (isOutdatedError(error)) await refresh();
  } finally {
    saving.value = false;
  }
}

// ---------- Edição e remoção na lista ----------

const busy = ref(false);
const editing = ref<{ id: string; teacherId: string; weeklyLessons: string | number } | null>(null);
const confirmingRemovalId = ref<string | null>(null);

function editTeachers(assignment: AssignmentDto): TeacherDto[] {
  const qualified = qualifiedTeachers(assignment.subjectId);
  const current = teacherById.value.get(assignment.teacherId);
  return current && !qualified.includes(current) ? [current, ...qualified] : qualified;
}

function startEdit(assignment: AssignmentDto): void {
  clearFeedback();
  confirmingRemovalId.value = null;
  editing.value = {
    id: assignment.id,
    teacherId: assignment.teacherId,
    weeklyLessons: assignment.weeklyLessons,
  };
}

async function runListAction(action: () => Promise<string>): Promise<void> {
  clearFeedback();
  busy.value = true;
  try {
    listFeedback.value = { kind: 'success', text: await action() };
    editing.value = null;
    confirmingRemovalId.value = null;
    await refresh();
  } catch (error) {
    listFeedback.value = { kind: 'error', text: errorMessage(error) };
    if (isOutdatedError(error)) {
      editing.value = null;
      confirmingRemovalId.value = null;
      await refresh();
    }
  } finally {
    busy.value = false;
  }
}

function saveEdit(assignment: AssignmentDto): Promise<void> {
  const draft = editing.value;
  const weeklyLessons = draft ? parseLessons(draft.weeklyLessons) : null;
  if (!draft || weeklyLessons === null) {
    clearFeedback();
    listFeedback.value = {
      kind: 'error',
      text: `Informe um número inteiro de aulas por semana entre 1 e ${MAX_WEEKLY_LESSONS}.`,
    };
    return Promise.resolve();
  }
  return runListAction(async () => {
    await assignmentsApi.update(assignment.id, {
      teacherId: draft.teacherId,
      weeklyLessons,
      version: assignment.version,
    });
    return `Atribuição de ${subjectName(assignment.subjectId)} em ${classGroupName(assignment.classGroupId)} atualizada.`;
  });
}

function remove(assignment: AssignmentDto): Promise<void> {
  return runListAction(async () => {
    await assignmentsApi.remove(assignment.id, assignment.version);
    return `Atribuição de ${subjectName(assignment.subjectId)} em ${classGroupName(assignment.classGroupId)} removida.`;
  });
}

onMounted(load);
</script>

<template>
  <section aria-labelledby="assignments-title">
    <h1 id="assignments-title">Atribuições</h1>
    <p class="muted">
      Defina qual professor dá cada disciplina em cada turma e quantas aulas por semana.
    </p>

    <p v-if="loadState === 'loading'" role="status">Carregando atribuições…</p>
    <div v-else-if="loadState === 'error'" role="alert">
      <p class="error">{{ loadError }}</p>
      <button type="button" @click="load">Tentar novamente</button>
    </div>

    <template v-else>
      <form
        class="card"
        novalidate
        aria-labelledby="assignment-form-title"
        @submit.prevent="submit"
      >
        <h2 id="assignment-form-title" class="form-title">Nova atribuição</h2>
        <div class="grid-form">
          <div>
            <label for="assignment-class-group">Turma</label>
            <select id="assignment-class-group" v-model="form.classGroupId">
              <option value="">Escolha a turma</option>
              <option v-for="c in activeClassGroups" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div>
            <label for="assignment-subject">Disciplina</label>
            <select id="assignment-subject" v-model="form.subjectId">
              <option value="">Escolha a disciplina</option>
              <option
                v-for="s in activeSubjects"
                :key="s.id"
                :value="s.id"
                :disabled="takenSubjectIds.has(s.id)"
              >
                {{ takenSubjectIds.has(s.id) ? `${s.name} (já atribuída nesta turma)` : s.name }}
              </option>
            </select>
          </div>
          <div>
            <label for="assignment-teacher">Professor</label>
            <select
              id="assignment-teacher"
              v-model="form.teacherId"
              :disabled="!form.subjectId"
              aria-describedby="assignment-teacher-hint"
            >
              <option value="">
                {{ form.subjectId ? 'Escolha o professor' : 'Escolha antes a disciplina' }}
              </option>
              <option v-for="t in formTeachers" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
            <p
              v-if="form.subjectId && formTeachers.length === 0"
              id="assignment-teacher-hint"
              class="hint"
            >
              Nenhum professor habilitado nesta disciplina.
              <RouterLink to="/professores">Habilite em Professores</RouterLink>.
            </p>
          </div>
          <div>
            <label for="assignment-lessons">Aulas por semana</label>
            <input
              id="assignment-lessons"
              v-model="form.weeklyLessons"
              type="number"
              inputmode="numeric"
              min="1"
              :max="MAX_WEEKLY_LESSONS"
              step="1"
            />
          </div>
        </div>
        <p v-if="activeClassGroups.length === 0" class="hint">
          Nenhuma turma cadastrada. <RouterLink to="/turmas">Cadastre as turmas</RouterLink>.
        </p>
        <div class="form-actions">
          <button type="submit" :disabled="saving">{{ saving ? 'Salvando…' : 'Atribuir' }}</button>
        </div>
        <p v-if="formFeedback?.kind === 'error'" class="error" role="alert">
          {{ formFeedback.text }}
        </p>
        <p v-if="formFeedback?.kind === 'success'" class="success" role="status">
          {{ formFeedback.text }}
        </p>
      </form>

      <h2>Por turma</h2>
      <p v-if="listFeedback?.kind === 'error'" class="error" role="alert">
        {{ listFeedback.text }}
      </p>
      <p v-if="listFeedback?.kind === 'success'" class="success" role="status">
        {{ listFeedback.text }}
      </p>
      <p v-if="groups.length === 0">Nenhuma atribuição feita ainda.</p>

      <section
        v-for="group in groups"
        :key="group.classGroupId"
        class="card group"
        :aria-label="`Turma ${group.name}`"
      >
        <h3 class="group-title">
          {{ group.name }}
          <span class="muted">— {{ lessonsLabel(group.total) }} por semana</span>
        </h3>
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Disciplina</th>
              <th scope="col">Professor</th>
              <th scope="col" class="num">Aulas/semana</th>
              <th scope="col"><span class="visually-hidden">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="assignment in group.items" :key="assignment.id">
              <th scope="row">{{ subjectName(assignment.subjectId) }}</th>
              <template v-if="editing?.id === assignment.id">
                <td>
                  <label :for="`edit-teacher-${assignment.id}`" class="visually-hidden">
                    Professor de {{ subjectName(assignment.subjectId) }}
                  </label>
                  <select :id="`edit-teacher-${assignment.id}`" v-model="editing.teacherId">
                    <option v-for="t in editTeachers(assignment)" :key="t.id" :value="t.id">
                      {{ t.archivedAt ? `${t.name} (arquivado)` : t.name }}
                    </option>
                  </select>
                </td>
                <td class="num">
                  <label :for="`edit-lessons-${assignment.id}`" class="visually-hidden">
                    Aulas por semana de {{ subjectName(assignment.subjectId) }}
                  </label>
                  <input
                    :id="`edit-lessons-${assignment.id}`"
                    v-model="editing.weeklyLessons"
                    class="lessons-input"
                    type="number"
                    min="1"
                    :max="MAX_WEEKLY_LESSONS"
                    step="1"
                    @keydown.esc="editing = null"
                  />
                </td>
                <td class="actions">
                  <button
                    type="button"
                    class="small"
                    :disabled="busy"
                    @click="saveEdit(assignment)"
                  >
                    Salvar
                  </button>
                  <button type="button" class="small ghost" @click="editing = null">
                    Cancelar
                  </button>
                </td>
              </template>
              <template v-else>
                <td>{{ teacherName(assignment.teacherId) }}</td>
                <td class="num">{{ assignment.weeklyLessons }}</td>
                <td class="actions">
                  <template v-if="confirmingRemovalId === assignment.id">
                    <span class="confirm-text">Remover?</span>
                    <button
                      type="button"
                      class="small danger"
                      :aria-label="`Confirmar remoção de ${subjectName(assignment.subjectId)} em ${group.name}`"
                      :disabled="busy"
                      @click="remove(assignment)"
                    >
                      Sim, remover
                    </button>
                    <button type="button" class="small ghost" @click="confirmingRemovalId = null">
                      Não
                    </button>
                  </template>
                  <template v-else>
                    <button
                      type="button"
                      class="small ghost"
                      :aria-label="`Editar ${subjectName(assignment.subjectId)} em ${group.name}`"
                      :disabled="busy"
                      @click="startEdit(assignment)"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      class="small ghost"
                      :aria-label="`Remover ${subjectName(assignment.subjectId)} em ${group.name}`"
                      :disabled="busy"
                      @click="
                        clearFeedback();
                        editing = null;
                        confirmingRemovalId = assignment.id;
                      "
                    >
                      Remover
                    </button>
                  </template>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </section>

      <p v-if="classGroupsWithoutAssignments.length > 0" class="muted">
        Turmas sem atribuições:
        {{ classGroupsWithoutAssignments.map((c) => c.name).join(', ') }}.
      </p>

      <h2>Carga por professor</h2>
      <p v-if="overloaded.length > 0" class="error">
        Acima da carga máxima:
        {{ overloaded.map((t) => `${t.name} (${t.total} de ${t.max})`).join(', ') }}.
      </p>
      <p v-if="teacherLoads.length === 0">Nenhum professor cadastrado ainda.</p>
      <table v-else class="table card" aria-label="Carga semanal por professor">
        <thead>
          <tr>
            <th scope="col">Professor</th>
            <th scope="col" class="num">Aulas/semana</th>
            <th scope="col" class="num">Máximo</th>
            <th scope="col" class="num">Hora-atividade</th>
            <th scope="col" class="num">Turmas</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="teacherLoad in teacherLoads" :key="teacherLoad.id">
            <th scope="row">{{ teacherLoad.name }}</th>
            <td class="num" :class="{ error: teacherLoad.over }">
              {{ teacherLoad.total }}
              <span v-if="teacherLoad.over" class="visually-hidden">(acima do máximo)</span>
            </td>
            <td class="num">{{ teacherLoad.max ?? '—' }}</td>
            <td class="num">{{ teacherLoad.planning }}</td>
            <td class="num">{{ teacherLoad.classGroups }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </section>
</template>
