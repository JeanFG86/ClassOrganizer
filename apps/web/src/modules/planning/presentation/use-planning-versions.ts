import { computed, onScopeDispose, ref, watch } from 'vue';
import type { PlanningDetailDto, RevisionComparisonDto } from '@classorganizer/contracts';
import { injectRequired } from '../../../shared/presentation/inject-required.ts';
import { errorMessage, isOutdatedError } from '../../../shared/presentation/feedback.ts';
import { planningsApiKey } from './plannings-key.ts';

export function usePlanningVersions(
  props: { planning: PlanningDetailDto; canWrite: boolean },
  changed: () => void,
) {
  const api = injectRequired(planningsApiKey);
  const selectedId = ref('');
  const targetId = ref('');
  const name = ref('');
  const busy = ref(false);
  const error = ref('');
  const status = ref('');
  const comparison = ref<RevisionComparisonDto | null>(null);
  const confirming = ref(false);
  const selected = computed(() => props.planning.revisions.find((r) => r.id === selectedId.value));
  const latest = computed(() => props.planning.revisions.at(-1));
  const editable = computed(() => props.canWrite && !props.planning.archivedAt);
  let request = 0;
  let failed: 'rename' | 'restore' | 'compare' | 'preserve' = 'compare';
  watch(
    () => props.planning,
    (value, previous) => {
      request++;
      busy.value = false;
      if (previous?.id !== value.id) {
        error.value = '';
        status.value = '';
        selectedId.value = '';
      }
      if (!value.revisions.some((r) => r.id === selectedId.value))
        selectedId.value = value.revisions[0]?.id ?? '';
      targetId.value = latest.value?.id ?? '';
      comparison.value = null;
      confirming.value = false;
    },
    { immediate: true },
  );
  watch(
    selected,
    () => {
      name.value = selected.value?.name ?? '';
      confirming.value = false;
      comparison.value = null;
    },
    { immediate: true },
  );
  watch(targetId, () => {
    comparison.value = null;
  });
  onScopeDispose(() => {
    request++;
  });
  async function run(
    kind: 'rename' | 'restore' | 'preserve',
    operation: () => Promise<unknown>,
    message: string,
  ) {
    const current = ++request;
    busy.value = true;
    error.value = '';
    status.value = '';
    try {
      await operation();
      if (current !== request) return;
      status.value = message;
      confirming.value = false;
      changed();
    } catch (cause) {
      if (current !== request) return;
      failed = kind;
      error.value = errorMessage(cause);
      if (isOutdatedError(cause)) changed();
    } finally {
      if (current === request) busy.value = false;
    }
  }
  function rename() {
    return run(
      'rename',
      () =>
        api.renameRevision(props.planning.id, selectedId.value, {
          version: props.planning.version,
          name: name.value,
        }),
      'Nome da revisão salvo.',
    );
  }
  function restore() {
    return run(
      'restore',
      () => api.restoreRevision(props.planning.id, selectedId.value, props.planning.version),
      'Revisão restaurada em um novo rascunho. Confira os dados e as regras novamente.',
    );
  }
  function preserve() {
    return run(
      'preserve',
      () => api.preserveRevision(props.planning.id, selectedId.value, props.planning.version),
      'Revisão preservada. Continue no novo rascunho; as conferências precisam ser refeitas.',
    );
  }
  async function compare() {
    const current = ++request;
    busy.value = true;
    error.value = '';
    status.value = '';
    comparison.value = null;
    try {
      const result = await api.compareRevisions(
        props.planning.id,
        selectedId.value,
        targetId.value,
      );
      if (current === request) comparison.value = result;
    } catch (cause) {
      if (current === request) {
        failed = 'compare';
        error.value = errorMessage(cause);
        if (isOutdatedError(cause)) changed();
      }
    } finally {
      if (current === request) busy.value = false;
    }
  }
  function retry() {
    if (failed === 'restore') {
      error.value = '';
      confirming.value = true;
      return;
    }
    return failed === 'rename' ? rename() : failed === 'preserve' ? preserve() : compare();
  }
  return {
    selectedId,
    targetId,
    name,
    busy,
    error,
    status,
    comparison,
    confirming,
    selected,
    latest,
    editable,
    rename,
    restore,
    preserve,
    compare,
    retry,
  };
}
