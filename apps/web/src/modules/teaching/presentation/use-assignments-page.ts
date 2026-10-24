import { useAccess } from '../../access/index.ts';
import type {
  AssignmentDto,
  ClassGroupDto,
  ResourceDto,
  SubjectDto,
  TeacherDto,
} from '@classorganizer/contracts';
import { computed, onMounted, ref } from 'vue';
import { assignmentsApiKey } from './assignments-key.ts';
import {
  classGroupsApiKey,
  resourcesApiKey,
  subjectsApiKey,
} from '../../school-structure/index.ts';
import {
  errorMessage,
  isOutdatedError,
  type Feedback,
} from '../../../shared/presentation/feedback.ts';
import { injectRequired } from '../../../shared/presentation/inject-required.ts';
import { compareNames } from '../../../shared/presentation/names.ts';
import { teachersApiKey } from './teachers-key.ts';
export function useAssignmentsPage() {
  const { canWrite } = useAccess();

  const assignmentsApi = injectRequired(assignmentsApiKey);

  const classGroupsApi = injectRequired(classGroupsApiKey);

  const subjectsApi = injectRequired(subjectsApiKey);

  const teachersApi = injectRequired(teachersApiKey);

  const resourcesApi = injectRequired(resourcesApiKey);

  const MAX_WEEKLY_LESSONS = 40;

  const MAX_RESOURCES = 5;

  type LoadState = 'loading' | 'ready' | 'error';

  const classGroups = ref<ClassGroupDto[]>([]);

  const subjects = ref<SubjectDto[]>([]);

  const teachers = ref<TeacherDto[]>([]);

  const resources = ref<ResourceDto[]>([]);

  const assignments = ref<AssignmentDto[]>([]);

  const loadState = ref<LoadState>('loading');

  const loadError = ref('');

  const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]));

  const classGroupById = computed(() => byId(classGroups.value));

  const subjectById = computed(() => byId(subjects.value));

  const teacherById = computed(() => byId(teachers.value));

  const resourceById = computed(() => byId(resources.value));

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

  function resourceNames(assignment: AssignmentDto): string {
    return assignment.resourceIds
      .map((id) => {
        const resource = resourceById.value.get(id);
        if (!resource) return '(removido)';
        return resource.archivedAt ? resource.name + ' (arquivado)' : resource.name;
      })
      .join(', ');
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
      const [classGroupList, subjectList, teacherList, assignmentList, resourceList] =
        await Promise.all([
          classGroupsApi.list(),
          subjectsApi.list(),
          teachersApi.list(),
          assignmentsApi.list(),
          resourcesApi.list(),
        ]);
      classGroups.value = classGroupList;
      subjects.value = subjectList;
      teachers.value = teacherList;
      assignments.value = assignmentList;
      resources.value = resourceList;
      loadState.value = 'ready';
    } catch (error) {
      loadError.value = errorMessage(error);
      loadState.value = 'error';
    }
  }

  type Participant = AssignmentDto['participants'][number];

  const emptyParticipants = (): Participant[] => [{ subjectId: '', teacherId: '' }];

  const form = ref({
    classGroupId: '',
    weeklyLessons: '',
    participants: emptyParticipants(),
    resourceIds: [] as string[],
  });

  const saving = ref(false);

  const busy = ref(false);

  const formFeedback = ref<Feedback | null>(null);

  const listFeedback = ref<Feedback | null>(null);

  const editing = ref<{
    id: string;
    participants: Participant[];
    weeklyLessons: string | number;
    resourceIds: string[];
  } | null>(null);

  const confirmingRemovalId = ref<string | null>(null);

  function blockSubjects(assignment: AssignmentDto): string {
    return [...new Set(assignment.participants.map((p) => subjectName(p.subjectId)))].join(' / ');
  }

  function clearFeedback(): void {
    formFeedback.value = null;
    listFeedback.value = null;
  }

  function validationMessage(
    participants: Participant[],
    raw: string | number,
    resourceIds: string[],
  ): string | null {
    if (!participants.length || participants.some((p) => !p.subjectId || !p.teacherId))
      return 'Escolha a disciplina e o professor de cada participante.';
    if (new Set(participants.map((p) => p.teacherId)).size !== participants.length)
      return 'Não repita o mesmo professor no bloco.';
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > MAX_WEEKLY_LESSONS)
      return 'Informe um número inteiro de aulas por semana entre 1 e 40.';
    if (resourceIds.length > MAX_RESOURCES)
      return 'Escolha até ' + MAX_RESOURCES + ' recursos especiais para o bloco.';
    return null;
  }

  async function submit(): Promise<void> {
    clearFeedback();
    const { classGroupId, participants, weeklyLessons, resourceIds } = form.value;
    const error = !classGroupId
      ? 'Escolha a turma.'
      : validationMessage(participants, weeklyLessons, resourceIds);
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
        resourceIds: [...resourceIds],
      });
      formFeedback.value = {
        kind: 'success',
        text: 'Bloco de aulas em ' + classGroupName(classGroupId) + ' criado.',
      };
      form.value = {
        classGroupId,
        weeklyLessons: '',
        participants: emptyParticipants(),
        resourceIds: [],
      };
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
      resourceIds: [...assignment.resourceIds],
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
    const error = validationMessage(draft.participants, draft.weeklyLessons, draft.resourceIds);
    if (error) {
      clearFeedback();
      listFeedback.value = { kind: 'error', text: error };
      return Promise.resolve();
    }
    return runListAction(async () => {
      await assignmentsApi.update(assignment.id, {
        participants: draft.participants.map((p) => ({ ...p })),
        weeklyLessons: Number(draft.weeklyLessons),
        resourceIds: [...draft.resourceIds],
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
  return {
    loadState,
    loadError,
    load,
    canWrite,
    submit,
    form,
    saving,
    activeClassGroups,
    MAX_WEEKLY_LESSONS,
    subjects,
    teachers,
    resources,
    formFeedback,
    listFeedback,
    groups,
    lessonsLabel,
    editing,
    saveEdit,
    busy,
    subjectName,
    teacherName,
    resourceNames,
    confirmingRemovalId,
    remove,
    startEdit,
    clearFeedback,
    classGroupsWithoutAssignments,
    overloaded,
    teacherLoads,
  };
}
