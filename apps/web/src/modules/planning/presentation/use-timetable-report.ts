import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { TimetableReportDto } from '@classorganizer/contracts';
import { injectRequired } from '../../../shared/presentation/inject-required.ts';
import { errorMessage } from '../../../shared/presentation/feedback.ts';
import { timetableReportsApiKey } from './timetable-reports-key.ts';

export function useTimetableReport() {
  const api = injectRequired(timetableReportsApiKey);
  const route = useRoute();
  const router = useRouter();
  const report = shallowRef<TimetableReportDto | null>(null);
  const perspective = ref<'class' | 'teacher'>('class');
  const targetId = ref('');
  const loading = ref(false);
  const error = ref('');
  let request = 0;
  const ready = computed(
    () => !loading.value && !error.value && report.value !== null && report.value.sheets.length > 0,
  );
  async function load() {
    const current = ++request;
    const id = route.params['id'];
    const revisionId = route.query['revisao'];
    error.value = '';
    loading.value = true;
    try {
      if (typeof id !== 'string' || typeof revisionId !== 'string' || !revisionId) {
        error.value = 'Escolha a revisão em Planejamentos para abrir a impressão.';
        report.value = null;
        return;
      }
      const result = await api.report(id, {
        revisionId,
        perspective: perspective.value,
        ...(targetId.value ? { entityId: targetId.value } : {}),
      });
      if (current === request) report.value = result;
    } catch (cause) {
      if (current === request) error.value = errorMessage(cause);
    } finally {
      if (current === request) loading.value = false;
    }
  }
  function changePerspective() {
    targetId.value = '';
    return load();
  }
  function chooseRevision(event: Event) {
    if (!(event.target instanceof HTMLSelectElement)) return;
    targetId.value = '';
    return router.replace({ query: { ...route.query, revisao: event.target.value } });
  }
  function print() {
    if (ready.value) window.print();
  }
  watch(
    () => [route.params['id'], route.query['revisao']],
    () => {
      void load();
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    request++;
  });
  return {
    report,
    perspective,
    targetId,
    loading,
    error,
    ready,
    load,
    changePerspective,
    chooseRevision,
    print,
  };
}
