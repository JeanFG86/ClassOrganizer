<script setup lang="ts">
import { useAccess } from '../services/access-api.ts';
import type {
  AssignmentDto,
  ClassGroupDto,
  SubjectDto,
  TeacherDto,
} from '@classorganizer/contracts';
import { computed, onMounted, ref } from 'vue';
import AssignmentParticipantsEditor from '../components/AssignmentParticipantsEditor.vue';
import { assignmentsApiKey } from '../services/assignments-api.ts';
import { classGroupsApiKey } from '../services/class-groups-api.ts';
import { errorMessage, isOutdatedError, type Feedback } from '../services/feedback.ts';
import { injectRequired } from '../services/inject-required.ts';
import { compareNames } from '../services/names.ts';
import { subjectsApiKey } from '../services/subjects-api.ts';
import { teachersApiKey } from '../services/teachers-api.ts';

const { canWrite } = useAccess();
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
      items: items.toSorted(
        (a, b) => compareNames(blockSubjects(a), blockSubjects(b)) || a.id.localeCompare(b.id),
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
      const own = assignments.value.filter((a) =>
        a.participants.some((p) => p.teacherId === teacher.id),
      );
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

type Participant = AssignmentDto['participants'][number];
const emptyParticipants = (): Participant[] => [{ subjectId: '', teacherId: '' }];
const form = ref({ classGroupId: '', weeklyLessons: '', participants: emptyParticipants() });
const saving = ref(false);
const busy = ref(false);
const formFeedback = ref<Feedback | null>(null);
const listFeedback = ref<Feedback | null>(null);
const editing = ref<{
  id: string;
  participants: Participant[];
  weeklyLessons: string | number;
} | null>(null);
const confirmingRemovalId = ref<string | null>(null);

function blockSubjects(assignment: AssignmentDto): string {
  return [...new Set(assignment.participants.map((p) => subjectName(p.subjectId)))].join(' / ');
}
function clearFeedback(): void {
  formFeedback.value = null;
  listFeedback.value = null;
}
function validationMessage(participants: Participant[], raw: string | number): string | null {
  if (!participants.length || participants.some((p) => !p.subjectId || !p.teacherId))
    return 'Escolha a disciplina e o professor de cada participante.';
  if (new Set(participants.map((p) => p.teacherId)).size !== participants.length)
    return 'Não repita o mesmo professor no bloco.';
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_WEEKLY_LESSONS)
    return 'Informe um número inteiro de aulas por semana entre 1 e 40.';
  return null;
}
async function submit(): Promise<void> {
  clearFeedback();
  const { classGroupId, participants, weeklyLessons } = form.value;
  const error = !classGroupId ? 'Escolha a turma.' : validationMessage(participants, weeklyLessons);
  if (error) {
    formFeedback.value = { kind: 'error', text: error };
    return;
  }
  saving.value = true;
  try {
    await assignmentsApi.create({
      classGroupId,
      participants: participants.map((p) => ({ ...p })),
      weeklyLessons: Number(weeklyLessons),
    });
    formFeedback.value = {
      kind: 'success',
      text: 'Bloco de aulas em ' + classGroupName(classGroupId) + ' criado.',
    };
    form.value = { classGroupId, weeklyLessons: '', participants: emptyParticipants() };
    await refresh();
  } catch (error) {
    formFeedback.value = { kind: 'error', text: errorMessage(error) };
    if (isOutdatedError(error)) await refresh();
  } finally {
    saving.value = false;
  }
}
function startEdit(assignment: AssignmentDto): void {
  clearFeedback();
  confirmingRemovalId.value = null;
  editing.value = {
    id: assignment.id,
    participants: assignment.participants.map((p) => ({ ...p })),
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
  if (!draft) return Promise.resolve();
  const error = validationMessage(draft.participants, draft.weeklyLessons);
  if (error) {
    clearFeedback();
    listFeedback.value = { kind: 'error', text: error };
    return Promise.resolve();
  }
  return runListAction(async () => {
    await assignmentsApi.update(assignment.id, {
      participants: draft.participants.map((p) => ({ ...p })),
      weeklyLessons: Number(draft.weeklyLessons),
      version: assignment.version,
    });
    return 'Bloco de aulas atualizado.';
  });
}
function remove(assignment: AssignmentDto): Promise<void> {
  return runListAction(async () => {
    await assignmentsApi.remove(assignment.id, assignment.version);
    return 'Bloco de aulas removido.';
  });
}
onMounted(load);
</script>

<template>
  <section aria-labelledby="assignments-title">
    <h1 id="assignments-title">Atribuições</h1>
    <p class="muted">
      Organize a carga da turma em blocos de aulas, com um ou mais professores no mesmo horário.
    </p>
    <p v-if="loadState === 'loading'" role="status">Carregando atribuições…</p>
    <div v-else-if="loadState === 'error'" role="alert">
      <p class="error">{{ loadError }}</p>
      <button type="button" @click="load">Tentar novamente</button>
    </div>
    <template v-else>
      <form
        v-if="canWrite"
        class="card"
        novalidate
        aria-labelledby="assignment-form-title"
        @submit.prevent="submit"
      >
        <h2 id="assignment-form-title" class="form-title">Novo bloco de aulas</h2>
        <div class="grid-form">
          <div>
            <label for="assignment-class-group">Turma</label>
            <select
              id="assignment-class-group"
              v-model="form.classGroupId"
              :disabled="saving || !canWrite"
            >
              <option value="">Escolha a turma</option>
              <option v-for="c in activeClassGroups" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
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
              :disabled="saving || !canWrite"
            />
          </div>
        </div>
        <AssignmentParticipantsEditor
          v-model="form.participants"
          id-prefix="assignment"
          :subjects="subjects"
          :teachers="teachers"
          :disabled="saving || !canWrite"
        />
        <p v-if="activeClassGroups.length === 0" class="hint">
          Nenhuma turma cadastrada. <RouterLink to="/turmas">Cadastre as turmas</RouterLink>.
        </p>
        <button type="submit" :disabled="saving || !canWrite">
          {{ saving ? 'Salvando…' : 'Atribuir' }}
        </button>
        <p
          v-if="formFeedback"
          :class="formFeedback.kind === 'error' ? 'error' : 'success'"
          :role="formFeedback.kind === 'error' ? 'alert' : 'status'"
        >
          {{ formFeedback.text }}
        </p>
      </form>
      <h2>Por turma</h2>
      <p
        v-if="listFeedback"
        :class="listFeedback.kind === 'error' ? 'error' : 'success'"
        :role="listFeedback.kind === 'error' ? 'alert' : 'status'"
      >
        {{ listFeedback.text }}
      </p>
      <p v-if="groups.length === 0">Nenhuma atribuição feita ainda.</p>
      <section
        v-for="group in groups"
        :key="group.classGroupId"
        class="card group"
        :aria-label="'Turma ' + group.name"
      >
        <h3 class="group-title">
          {{ group.name }} <span class="muted">— {{ lessonsLabel(group.total) }} por semana</span>
        </h3>
        <p class="hint">
          A carga da turma conta cada bloco uma vez; cada professor recebe a carga inteira do bloco
          em que participa.
        </p>
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Bloco</th>
              <th scope="col">Disciplina e professor</th>
              <th scope="col" class="num">Aulas/semana</th>
              <th scope="col"><span class="visually-hidden">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(assignment, index) in group.items" :key="assignment.id">
              <tr v-if="editing?.id === assignment.id">
                <td colspan="4">
                  <form
                    novalidate
                    :aria-label="'Editar bloco ' + (index + 1) + ' em ' + group.name"
                    @submit.prevent="saveEdit(assignment)"
                  >
                    <AssignmentParticipantsEditor
                      v-model="editing.participants"
                      :id-prefix="'edit-' + assignment.id"
                      :subjects="subjects"
                      :teachers="teachers"
                      :disabled="busy || !canWrite"
                    />
                    <label :for="'edit-lessons-' + assignment.id"
                      >Aulas por semana do bloco {{ index + 1 }}</label
                    >
                    <input
                      :id="'edit-lessons-' + assignment.id"
                      v-model="editing.weeklyLessons"
                      class="lessons-input"
                      type="number"
                      min="1"
                      :max="MAX_WEEKLY_LESSONS"
                      step="1"
                      :disabled="busy || !canWrite"
                    />
                    <div class="form-actions">
                      <button type="submit" :disabled="busy || !canWrite">Salvar</button
                      ><button
                        type="button"
                        class="ghost"
                        :disabled="busy || !canWrite"
                        @click="editing = null"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                </td>
              </tr>
              <tr v-else>
                <th scope="row">{{ index + 1 }}</th>
                <td>
                  <div v-for="p in assignment.participants" :key="p.teacherId">
                    {{ subjectName(p.subjectId) }} — {{ teacherName(p.teacherId) }}
                  </div>
                </td>
                <td class="num">{{ assignment.weeklyLessons }}</td>
                <td class="actions">
                  <template v-if="confirmingRemovalId === assignment.id">
                    <span>Remover bloco {{ index + 1 }}?</span>
                    <button
                      type="button"
                      class="small danger"
                      :aria-label="
                        'Confirmar remoção do bloco ' + (index + 1) + ' em ' + group.name
                      "
                      :disabled="busy || !canWrite"
                      @click="remove(assignment)"
                    >
                      Sim, remover
                    </button>
                    <button
                      type="button"
                      class="small ghost"
                      :disabled="busy || !canWrite"
                      @click="confirmingRemovalId = null"
                    >
                      Não
                    </button>
                  </template>
                  <template v-else>
                    <button
                      type="button"
                      class="small ghost"
                      :aria-label="'Editar bloco ' + (index + 1) + ' em ' + group.name"
                      :disabled="busy || !canWrite"
                      @click="startEdit(assignment)"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      class="small ghost"
                      :aria-label="'Remover bloco ' + (index + 1) + ' em ' + group.name"
                      :disabled="busy || !canWrite"
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
              </tr>
            </template>
          </tbody>
        </table>
      </section>
      <p v-if="classGroupsWithoutAssignments.length > 0" class="muted">
        Turmas sem atribuições: {{ classGroupsWithoutAssignments.map((c) => c.name).join(', ') }}.
      </p>
      <h2>Carga por professor</h2>
      <p v-if="overloaded.length > 0" class="error">
        Acima da carga máxima:
        {{ overloaded.map((t) => t.name + ' (' + t.total + ' de ' + t.max + ')').join(', ') }}.
      </p>
      <p v-if="teacherLoads.length === 0">Nenhum professor cadastrado ainda.</p>
      <div v-else class="card group">
        <table class="table" aria-label="Carga semanal por professor">
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
      </div>
    </template>
  </section>
</template>
