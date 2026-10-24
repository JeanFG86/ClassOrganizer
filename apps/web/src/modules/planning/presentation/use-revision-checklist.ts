import { onScopeDispose, ref, shallowRef, watch } from 'vue';
import type {
  PlanningDetailDto,
  ReviewItemDto,
  RevisionChecklistDto,
  RevisionDto,
} from '@classorganizer/contracts';
import { injectRequired } from '../../../shared/presentation/inject-required.ts';
import { errorMessage } from '../../../shared/presentation/feedback.ts';
import { planningsApiKey } from './plannings-key.ts';

/**
 * Carrega o checklist da revisão sempre que o planejamento muda de versão. Os itens marcados
 * começam pelo que está salvo e só seguem para a API quando a secretaria salva (ADR 0022).
 */
export function useRevisionChecklist(props: {
  planning: PlanningDetailDto;
  revision: RevisionDto;
}) {
  const api = injectRequired(planningsApiKey);
  const checklist = shallowRef<RevisionChecklistDto | null>(null);
  const loading = ref(false);
  const error = ref('');
  const selected = ref<ReviewItemDto[]>([]);
  let request = 0;

  async function load() {
    const current = ++request;
    loading.value = true;
    error.value = '';
    try {
      const result = await api.revisionChecklist(props.planning.id, props.revision.id);
      if (current !== request) return;
      checklist.value = result;
    } catch (cause) {
      if (current !== request) return;
      checklist.value = null;
      error.value = errorMessage(cause);
    } finally {
      if (current === request) loading.value = false;
    }
  }
  watch(
    () => [props.planning.id, props.planning.version, props.revision.id] as const,
    () => {
      selected.value = [...props.revision.reviewedItems];
      void load();
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    request++;
  });
  return { checklist, loading, error, selected, retry: load };
}
