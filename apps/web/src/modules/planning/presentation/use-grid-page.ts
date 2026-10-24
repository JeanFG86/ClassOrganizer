import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type {
  GridEvaluationDto,
  GridOperationDto,
  GridRulesDto,
  GridSlotDto,
  GridViewDto,
  PlacementDto,
} from '@classorganizer/contracts';
import { useAccess } from '../../access/index.ts';
import { errorMessage, isOutdatedError } from '../../../shared/presentation/feedback.ts';
import { gridApiKey } from './grid-key.ts';
import { type GridRef } from '../application/grid-api.ts';
import {
  GRID_WEEKDAYS,
  dayName,
  gridLookup,
  placementKey,
  type GridCandidate,
  type GridItem,
} from './grid-view.ts';
import { injectRequired } from '../../../shared/presentation/inject-required.ts';
export function useGridPage() {
  const api = injectRequired(gridApiKey);

  const { canWrite } = useAccess();

  const route = useRoute();

  const router = useRouter();

  const planningId = computed(() => String(route.params['id'] ?? ''));

  const view = shallowRef<GridViewDto | null>(null);

  const loadState = ref<'loading' | 'ready' | 'error'>('loading');

  const loadError = ref('');

  const error = ref('');

  const status = ref('');

  const busy = ref(false);

  const mode = ref<'class' | 'teacher' | 'overview'>('class');

  const classGroupId = ref('');

  const teacherId = ref('');

  const shiftId = ref('');

  const weekday = ref<number>(1);

  const selected = ref<PlacementDto | null>(null);

  const chooser = ref<{ weekday: number; periodId: string; candidates: GridCandidate[] } | null>(
    null,
  );

  const pending = shallowRef<{ operation: GridOperationDto; evaluation: GridEvaluationDto } | null>(
    null,
  );

  const lookup = computed(() => (view.value ? gridLookup(view.value) : null));

  const interactive = computed(() => Boolean(view.value?.editable && canWrite.value));

  const ref_ = computed<GridRef | null>(() =>
    view.value
      ? {
          planningId: view.value.planning.id,
          version: view.value.planning.version,
          revisionId: view.value.revision.id,
        }
      : null,
  );

  const selectedKey = computed(() => (selected.value ? placementKey(selected.value) : null));

  async function load() {
    loadState.value = view.value ? loadState.value : 'loading';
    try {
      const revision =
        typeof route.query['revisao'] === 'string' ? route.query['revisao'] : undefined;
      const next = await api.view(planningId.value, revision);
      view.value = next;
      const look = gridLookup(next);
      if (!next.timetable.classGroups.some((c) => c.id === classGroupId.value))
        classGroupId.value = look.sortedClassGroups()[0]?.id ?? '';
      if (!next.timetable.teachers.some((t) => t.id === teacherId.value))
        teacherId.value = look.sortedTeachers()[0]?.id ?? '';
      if (!next.shifts.some((s) => s.id === shiftId.value))
        shiftId.value = next.shifts[0]?.id ?? '';
      loadState.value = 'ready';
    } catch (cause) {
      loadError.value = errorMessage(cause);
      loadState.value = 'error';
    }
  }

  function reset() {
    selected.value = null;
    chooser.value = null;
    pending.value = null;
  }

  watch([mode, classGroupId, teacherId], reset);

  watch(
    () => route.query['revisao'],
    async () => {
      reset();
      await load();
    },
  );

  const slot = (p: GridSlotDto): GridSlotDto => ({
    kind: p.kind,
    entityId: p.entityId,
    weekday: p.weekday,
    periodId: p.periodId,
  });

  const asWeekday = (value: number) => GRID_WEEKDAYS.find((d) => d.value === value)?.value ?? 1;

  async function preview(operation: GridOperationDto) {
    const current = ref_.value;
    if (!current) return;
    busy.value = true;
    error.value = '';
    status.value = '';
    chooser.value = null;
    try {
      pending.value = { operation, evaluation: await api.preview(current, operation) };
      await nextTick();
      document.getElementById('grid-pending-title')?.focus();
    } catch (cause) {
      await fail(cause);
    } finally {
      busy.value = false;
    }
  }

  async function fail(cause: unknown) {
    error.value = errorMessage(cause);
    if (isOutdatedError(cause)) {
      reset();
      await load();
    }
  }

  async function confirm() {
    const current = ref_.value;
    const operation = pending.value?.operation;
    if (!current || !operation) return;
    busy.value = true;
    error.value = '';
    try {
      const result = await api.apply(current, operation);
      reset();
      await load();
      status.value = 'Alteração aplicada. ' + (result.summary ?? '');
    } catch (cause) {
      reset();
      await fail(cause);
      await load();
    } finally {
      busy.value = false;
    }
  }

  async function undo() {
    const current = ref_.value;
    if (!current) return;
    busy.value = true;
    error.value = '';
    status.value = '';
    try {
      const result = await api.undo(current);
      reset();
      await load();
      status.value = result.summary ?? 'Alteração desfeita.';
    } catch (cause) {
      await fail(cause);
    } finally {
      busy.value = false;
    }
  }

  async function saveRules(rules: GridRulesDto) {
    const current = ref_.value;
    if (!current) return;
    busy.value = true;
    error.value = '';
    status.value = '';
    try {
      await api.changeRules(current, rules);
      reset();
      await load();
      status.value =
        'Regras salvas. Confira novamente as regras e cargas da revisão em Planejamentos.';
    } catch (cause) {
      await fail(cause);
    } finally {
      busy.value = false;
    }
  }

  function pick(item: GridItem) {
    if (!interactive.value || busy.value) return;
    pending.value = null;
    chooser.value = null;
    const current = selected.value;
    if (!current) selected.value = item.placement;
    else if (placementKey(current) === placementKey(item.placement)) selected.value = null;
    else void preview({ type: 'swap', first: slot(current), second: slot(item.placement) });
  }

  function empty(day: number, periodId: string) {
    if (!interactive.value || busy.value || !lookup.value) return;
    pending.value = null;
    const current = selected.value;
    if (current) {
      void preview({ type: 'move', slot: slot(current), weekday: asWeekday(day), periodId });
      return;
    }
    chooser.value = {
      weekday: day,
      periodId,
      candidates: lookup.value.candidates(
        mode.value === 'class'
          ? { classGroupId: classGroupId.value }
          : { teacherId: teacherId.value },
      ),
    };
    void nextTick(() => document.getElementById('grid-chooser-title')?.focus());
  }

  function insert(candidate: GridCandidate) {
    const target = chooser.value;
    if (!target) return;
    void preview({
      type: 'place',
      slot: {
        kind: candidate.kind,
        entityId: candidate.entityId,
        weekday: asWeekday(target.weekday),
        periodId: target.periodId,
      },
    });
  }

  const classRows = computed(() => {
    const classGroup = lookup.value?.classGroups.get(classGroupId.value);
    return classGroup && lookup.value ? lookup.value.rows(classGroup.periodIds) : [];
  });

  const teacherSections = computed(() =>
    lookup.value
      ? lookup.value.teacherShifts(teacherId.value).map((shift) => ({
          shift,
          rows: lookup.value?.rows(shift.periodIds) ?? [],
        }))
      : [],
  );

  const overviewShift = computed(() => view.value?.shifts.find((s) => s.id === shiftId.value));

  const overviewClasses = computed(
    () =>
      lookup.value
        ?.sortedClassGroups()
        .filter((c) => overviewShift.value?.periodIds.includes(c.periodIds[0] ?? '')) ?? [],
  );

  function classCell(day: number, periodId: string) {
    return {
      items: lookup.value?.classItems(classGroupId.value, day, periodId) ?? [],
      unavailable: false,
    };
  }

  function teacherCell(day: number, periodId: string) {
    return {
      items: lookup.value?.teacherItems(teacherId.value, day, periodId) ?? [],
      unavailable: lookup.value?.unavailable(teacherId.value, day, periodId) ?? false,
    };
  }

  const describe = (item: GridItem) => lookup.value?.describe(item.placement) ?? '';

  const hasProblem = (item: GridItem) => lookup.value?.hasProblem(item.placement) ?? false;

  function chooseRevision(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    void router.replace({ query: value ? { revisao: value } : {} });
  }

  function date(value: string) {
    return new Date(value).toLocaleString('pt-BR');
  }

  onMounted(load);
  return {
    loadState,
    loadError,
    load,
    view,
    lookup,
    chooseRevision,
    canWrite,
    error,
    status,
    mode,
    classGroupId,
    classRows,
    classCell,
    describe,
    hasProblem,
    selectedKey,
    interactive,
    pick,
    empty,
    teacherId,
    teacherSections,
    teacherCell,
    shiftId,
    weekday,
    GRID_WEEKDAYS,
    overviewShift,
    dayName,
    overviewClasses,
    placementKey,
    chooser,
    busy,
    insert,
    selected,
    pending,
    preview,
    slot,
    confirm,
    reset,
    undo,
    date,
    saveRules,
  };
}
