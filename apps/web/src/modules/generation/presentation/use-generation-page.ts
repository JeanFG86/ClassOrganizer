import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import type {
  GenerationDetailDto,
  GenerationListDto,
  GenerationRunDto,
  GridViewDto,
  PreferenceCriterionDto,
} from '@classorganizer/contracts';
import { useAccess } from '../../access/index.ts';
import { errorMessage, isOutdatedError } from '../../../shared/presentation/feedback.ts';
import { generationApiKey } from './generation-key.ts';
import { gridApiKey } from '../../planning/index.ts';
import { type GridRef } from '../../planning/index.ts';
import { gridLookup, placementKey, type GridItem } from '../../planning/index.ts';
import { injectRequired } from '../../../shared/presentation/inject-required.ts';
export function useGenerationPage() {
  /** Intervalo de acompanhamento enquanto houver uma geração ativa. */
  const POLL_MS = 2000;

  const STATUS_TEXT: Record<GenerationRunDto['status'], { title: string; text: string }> = {
    queued: { title: 'Na fila', text: 'A solicitação aguarda o início do cálculo.' },
    running: {
      title: 'Calculando',
      text: 'A busca está em andamento. A grade atual continua disponível e só muda se você aplicar a proposta.',
    },
    feasible: {
      title: 'Grade completa encontrada',
      text: 'A proposta cumpre todas as regras obrigatórias e mantém as aulas fixadas.',
    },
    infeasible: {
      title: 'Não há grade possível com estes dados',
      text: 'A busca demonstrou que as cargas, as regras e as aulas fixadas desta revisão não cabem juntas. Veja os motivos abaixo.',
    },
    inconclusive: {
      title: 'Busca sem resposta',
      text: 'O limite de tempo ou de recursos terminou sem encontrar uma grade e sem provar que ela não existe. Tente de novo ou revise as fixações.',
    },
    cancelled: { title: 'Cancelada', text: 'A geração foi cancelada. A grade atual não mudou.' },
    invalid_model: {
      title: 'Dados que a geração não aceita',
      text: 'Os dados desta revisão não puderam ser usados na geração. Corrija os pontos abaixo.',
    },
    failed: {
      title: 'Falha técnica',
      text: 'A geração não terminou por um erro técnico. A grade atual foi preservada.',
    },
  };

  /** Critérios da ADR 0015, na ordem do plano: manter a grade vem antes das demais melhorias. */
  const CRITERIA: Record<PreferenceCriterionDto, { title: string; text: string }> = {
    keep_current: {
      title: 'Manter a grade atual',
      text: 'Muda o mínimo possível das aulas já colocadas que não estão fixadas.',
    },
    teacher_windows: {
      title: 'Evitar janelas dos professores',
      text: 'Reduz as aulas vagas entre duas atividades do professor no mesmo turno e dia.',
    },
    daily_spread: {
      title: 'Distribuir cada disciplina pelos dias',
      text: 'Evita repetir a disciplina da turma num dia quando havia outro dia livre para ela. Desmarque se a escola prefere aulas geminadas.',
    },
  };

  const DEFAULT_ORDER: PreferenceCriterionDto[] = [
    'keep_current',
    'teacher_windows',
    'daily_spread',
  ];

  /** Por que uma geração viável parou de melhorar a grade. */
  const STOP_TEXT: Record<string, string> = {
    solution:
      'Nenhuma preferência foi marcada: esta é a primeira grade válida encontrada, não necessariamente a melhor.',
    preferences_met: 'As preferências marcadas foram atendidas por completo.',
    local_optimum:
      'A melhoria parou quando deixou de encontrar trocas que melhorassem as preferências, na ordem escolhida. Outra geração pode encontrar uma grade melhor.',
    time_limit:
      'A melhoria parou no limite de tempo, com a melhor grade encontrada até ali. Outra geração pode encontrar uma grade melhor.',
    node_limit:
      'A melhoria parou no limite de tentativas, com a melhor grade encontrada até ali. Outra geração pode encontrar uma grade melhor.',
  };

  const gridApi = injectRequired(gridApiKey);

  const api = injectRequired(generationApiKey);

  const { canWrite } = useAccess();

  const route = useRoute();

  const planningId = computed(() => String(route.params['id'] ?? ''));

  const view = shallowRef<GridViewDto | null>(null);

  const list = shallowRef<GenerationListDto | null>(null);

  const detail = shallowRef<GenerationDetailDto | null>(null);

  const selectedId = ref<string | null>(null);

  const loadState = ref<'loading' | 'ready' | 'error'>('loading');

  const loadError = ref('');

  const error = ref('');

  const status = ref('');

  const busy = ref(false);

  const confirming = ref(false);

  const mode = ref<'class' | 'teacher'>('class');

  const classGroupId = ref('');

  const teacherId = ref('');

  const now = ref(Date.now());

  /** Ordem exibida dos critérios; os marcados seguem para a solicitação nessa ordem. */
  const criteria = ref(DEFAULT_ORDER.map((criterion) => ({ criterion, enabled: true })));

  let criteriaFromHistory = false;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const interactive = computed(() => Boolean(view.value?.editable && canWrite.value));

  const gridRef = computed<GridRef | null>(() =>
    view.value
      ? {
          planningId: view.value.planning.id,
          version: view.value.planning.version,
          revisionId: view.value.revision.id,
        }
      : null,
  );

  const active = computed(() => list.value?.active ?? null);

  const comparison = computed(() => detail.value?.comparison ?? null);

  /** A grade proposta lida com os nomes da revisão. */
  const proposal = computed(() =>
    view.value && comparison.value
      ? gridLookup({
          ...view.value,
          placements: comparison.value.placements,
          diagnosis: comparison.value.diagnosis,
        })
      : null,
  );

  const currentKeys = computed(
    () =>
      new Set(view.value?.placements.map((p) => placementKey(p) + '|' + String(p.pinned)) ?? []),
  );

  async function loadView() {
    const next = await gridApi.view(planningId.value);
    view.value = next;
    const look = gridLookup(next);
    if (!next.timetable.classGroups.some((c) => c.id === classGroupId.value))
      classGroupId.value = look.sortedClassGroups()[0]?.id ?? '';
    if (!next.timetable.teachers.some((t) => t.id === teacherId.value))
      teacherId.value = look.sortedTeachers()[0]?.id ?? '';
  }

  async function loadDetail(runId: string) {
    selectedId.value = runId;
    confirming.value = false;
    detail.value = await api.detail(planningId.value, runId);
  }

  async function load() {
    loadState.value = view.value ? loadState.value : 'loading';
    try {
      await loadView();
      list.value = await api.list(planningId.value);
      rememberCriteria(list.value);
      const finished = list.value.runs.find((r) => r.id !== list.value?.active?.id);
      const target = selectedId.value ?? finished?.id;
      if (target && target !== list.value.active?.id) await loadDetail(target);
      loadState.value = 'ready';
      schedule();
    } catch (cause) {
      loadError.value = errorMessage(cause);
      loadState.value = 'error';
    }
  }

  /** Começa pelas prioridades da última solicitação desta revisão, se houver. */
  function rememberCriteria(current: GenerationListDto) {
    const last = current.runs[0]?.options.preferences;
    if (criteriaFromHistory || !last) return;
    criteriaFromHistory = true;
    criteria.value = [
      ...last.map((criterion) => ({ criterion, enabled: true })),
      ...DEFAULT_ORDER.filter((c) => !last.includes(c)).map((criterion) => ({
        criterion,
        enabled: false,
      })),
    ];
  }

  async function moveCriterion(index: number, offset: -1 | 1) {
    const next = [...criteria.value];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + offset, 0, item);
    criteria.value = next;
    await nextTick();
    document.getElementById('criterion-' + item.criterion)?.focus();
  }

  const chosenOrder = computed(() =>
    criteria.value.filter((c) => c.enabled).map((c) => c.criterion),
  );

  function orderText(order: readonly PreferenceCriterionDto[]) {
    return order.length
      ? order.map((c, index) => index + 1 + '. ' + CRITERIA[c].title).join('; ')
      : 'nenhuma';
  }

  function schedule() {
    clearTimeout(timer);
    if (!disposed && list.value?.active) timer = setTimeout(() => void poll(), POLL_MS);
  }

  /** Acompanha a geração ativa; ao terminar, mostra o resultado. */
  async function poll() {
    const before = list.value?.active?.id;
    try {
      now.value = Date.now();
      list.value = await api.list(planningId.value);
      if (before && list.value.active?.id !== before) {
        await loadDetail(before);
        status.value =
          'Geração terminada: ' +
          (detail.value ? STATUS_TEXT[detail.value.run.status].title : 'veja o resultado') +
          '.';
      }
    } catch (cause) {
      error.value = errorMessage(cause);
    } finally {
      schedule();
    }
  }

  async function fail(cause: unknown) {
    error.value = errorMessage(cause);
    if (isOutdatedError(cause)) await load();
  }

  async function request() {
    const current = gridRef.value;
    if (!current) return;
    busy.value = true;
    error.value = '';
    status.value = '';
    try {
      await api.request(current, chosenOrder.value);
      status.value = 'Geração solicitada. Acompanhe o andamento nesta tela.';
      list.value = await api.list(planningId.value);
      schedule();
    } catch (cause) {
      await fail(cause);
    } finally {
      busy.value = false;
    }
  }

  async function cancel() {
    const run = active.value;
    if (!run) return;
    busy.value = true;
    error.value = '';
    try {
      const result = await api.cancel(planningId.value, run.id);
      status.value =
        result.status === 'cancelled'
          ? 'Geração cancelada.'
          : 'Cancelamento solicitado. A busca será interrompida em instantes.';
      list.value = await api.list(planningId.value);
      if (!list.value.active) await loadDetail(run.id);
      schedule();
    } catch (cause) {
      await fail(cause);
    } finally {
      busy.value = false;
    }
  }

  async function startApply() {
    confirming.value = true;
    await nextTick();
    document.getElementById('generation-confirm-title')?.focus();
  }

  async function apply() {
    const current = gridRef.value;
    const runId = detail.value?.run.id;
    if (!current || !runId) return;
    busy.value = true;
    error.value = '';
    status.value = '';
    try {
      const result = await api.apply(current, runId);
      confirming.value = false;
      await loadView();
      list.value = await api.list(planningId.value);
      await loadDetail(runId);
      status.value = 'Proposta aplicada à grade. ' + (result.summary ?? '');
    } catch (cause) {
      confirming.value = false;
      await fail(cause);
      if (selectedId.value) await loadDetail(selectedId.value).catch(() => undefined);
    } finally {
      busy.value = false;
    }
  }

  watch(mode, () => (confirming.value = false));

  function date(value: string) {
    return new Date(value).toLocaleString('pt-BR');
  }

  function seconds(ms: number) {
    if (ms < 1000) return 'menos de 1 s';
    return (ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' s';
  }

  /** Etapa e tempo decorrido, sem percentual: a busca não tem progresso mensurável. */
  function progress(run: GenerationRunDto) {
    if (run.cancelRequested) return 'Cancelamento solicitado; aguardando a busca parar.';
    if (run.status === 'queued') return 'Na fila desde ' + date(run.requestedAt) + '.';
    const since = run.startedAt ? Math.max(0, now.value - new Date(run.startedAt).getTime()) : 0;
    return (
      'Calculando há ' +
      Math.round(since / 1000) +
      ' s' +
      (run.attempts > 1
        ? ' (tentativa ' + run.attempts + ', após uma interrupção do worker)'
        : '') +
      '. Limite de ' +
      seconds(run.options.timeLimitMs) +
      '.'
    );
  }

  function outcome(run: GenerationRunDto) {
    if (run.appliedAt) return 'Aplicada';
    return (
      STATUS_TEXT[run.status].title +
      (run.status === 'feasible' && run.stale ? ' (desatualizada)' : '')
    );
  }

  const classRows = computed(() => {
    const look = proposal.value;
    const classGroup = look?.classGroups.get(classGroupId.value);
    return classGroup && look ? look.rows(classGroup.periodIds) : [];
  });

  const teacherSections = computed(() => {
    const look = proposal.value;
    return look
      ? look
          .teacherShifts(teacherId.value)
          .map((shift) => ({ shift, rows: look.rows(shift.periodIds) }))
      : [];
  });

  const classCell = (day: number, periodId: string) => ({
    items: proposal.value?.classItems(classGroupId.value, day, periodId) ?? [],
    unavailable: false,
  });

  const teacherCell = (day: number, periodId: string) => ({
    items: proposal.value?.teacherItems(teacherId.value, day, periodId) ?? [],
    unavailable: proposal.value?.unavailable(teacherId.value, day, periodId) ?? false,
  });

  const describe = (item: GridItem) => proposal.value?.describe(item.placement) ?? '';

  const hasProblem = (item: GridItem) => proposal.value?.hasProblem(item.placement) ?? false;

  const isChanged = (item: GridItem) =>
    !currentKeys.value.has(placementKey(item.placement) + '|' + String(item.placement.pinned));

  onMounted(load);

  onUnmounted(() => {
    disposed = true;
    clearTimeout(timer);
  });
  return {
    planningId,
    loadState,
    loadError,
    load,
    view,
    list,
    canWrite,
    interactive,
    criteria,
    CRITERIA,
    moveCriterion,
    busy,
    active,
    request,
    error,
    status,
    STATUS_TEXT,
    progress,
    cancel,
    detail,
    STOP_TEXT,
    orderText,
    date,
    seconds,
    comparison,
    proposal,
    confirming,
    startApply,
    apply,
    mode,
    classGroupId,
    classRows,
    classCell,
    describe,
    hasProblem,
    isChanged,
    teacherId,
    teacherSections,
    teacherCell,
    outcome,
    selectedId,
    loadDetail,
    fail,
  };
}
