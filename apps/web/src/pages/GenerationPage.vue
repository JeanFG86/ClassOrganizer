<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import type {
  GenerationDetailDto,
  GenerationListDto,
  GenerationRunDto,
  GridViewDto,
  PreferenceCriterionDto,
} from '@classorganizer/contracts';
import GridMatrix from '../components/GridMatrix.vue';
import { useAccess } from '../services/access-api.ts';
import { errorMessage, isOutdatedError } from '../services/feedback.ts';
import { generationApiKey } from '../services/generation-api.ts';
import { gridApiKey, type GridRef } from '../services/grid-api.ts';
import { gridLookup, placementKey, type GridItem } from '../services/grid-view.ts';
import { injectRequired } from '../services/inject-required.ts';

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
const DEFAULT_ORDER: PreferenceCriterionDto[] = ['keep_current', 'teacher_windows', 'daily_spread'];
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
  () => new Set(view.value?.placements.map((p) => placementKey(p) + '|' + String(p.pinned)) ?? []),
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
const chosenOrder = computed(() => criteria.value.filter((c) => c.enabled).map((c) => c.criterion));
function orderText(order: readonly PreferenceCriterionDto[]) {
  return order.length
    ? order.map((c, index) => index + 1 + '. ' + CRITERIA[c].title).join('; ')
    : 'nenhuma';
}
function schedule() {
  clearTimeout(timer);
  if (list.value?.active) timer = setTimeout(() => void poll(), POLL_MS);
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
    (run.attempts > 1 ? ' (tentativa ' + run.attempts + ', após uma interrupção do worker)' : '') +
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
onUnmounted(() => clearTimeout(timer));
</script>

<template>
  <section aria-labelledby="generation-title">
    <p>
      <RouterLink :to="'/planejamentos/' + planningId + '/grade'">← Grade</RouterLink>
    </p>
    <p v-if="loadState === 'loading'" role="status">Carregando a geração automática…</p>
    <div v-else-if="loadState === 'error'" role="alert">
      <h1 id="generation-title">Geração automática</h1>
      <p class="error">{{ loadError }}</p>
      <button type="button" @click="load">Tentar novamente</button>
    </div>
    <template v-else-if="view && list">
      <h1 id="generation-title">
        Geração automática · {{ view.planning.name }} · {{ view.planning.year }}
      </h1>
      <div class="card">
        <p>
          Revisão {{ view.revision.number }} ·
          {{ view.revision.sealedAt ? 'Concluída' : 'Rascunho' }}
        </p>
        <p class="hint">
          A geração usa os cadastros desta revisão, as regras da grade e as aulas fixadas. O cálculo
          roda em segundo plano; a grade atual continua disponível e só muda quando você aplicar a
          proposta.
        </p>
        <p v-if="!view.editable" class="hint">
          {{
            view.planning.archivedAt
              ? 'Planejamento arquivado: a geração fica disponível só para consulta.'
              : 'Revisão concluída: abra um novo rascunho em Planejamentos para gerar outra grade.'
          }}
        </p>
        <p v-else-if="!canWrite" class="hint">Seu perfil permite apenas acompanhar as gerações.</p>
        <fieldset v-if="interactive" class="generation-criteria">
          <legend>Prioridades da geração</legend>
          <p class="hint">
            As regras obrigatórias e as aulas fixadas vêm sempre antes. Depois, cada critério
            marcado só desempata os anteriores: nenhuma melhora num critério de baixo compensa
            piorar um de cima.
          </p>
          <ol>
            <li v-for="(item, index) in criteria" :key="item.criterion">
              <div>
                <label class="check">
                  <input
                    :id="'criterion-' + item.criterion"
                    v-model="item.enabled"
                    type="checkbox"
                  />
                  {{ CRITERIA[item.criterion].title }}
                </label>
                <p class="hint">{{ CRITERIA[item.criterion].text }}</p>
              </div>
              <span class="actions">
                <button
                  type="button"
                  class="small ghost"
                  :disabled="index === 0"
                  :aria-label="'Subir a prioridade de ' + CRITERIA[item.criterion].title"
                  @click="moveCriterion(index, -1)"
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="small ghost"
                  :disabled="index === criteria.length - 1"
                  :aria-label="'Descer a prioridade de ' + CRITERIA[item.criterion].title"
                  @click="moveCriterion(index, 1)"
                >
                  ↓
                </button>
              </span>
            </li>
          </ol>
        </fieldset>
        <div v-if="interactive" class="actions">
          <button type="button" :disabled="busy || Boolean(active)" @click="request">
            Gerar grade
          </button>
        </div>
      </div>

      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <p v-if="status" role="status" class="success">{{ status }}</p>

      <section v-if="active" class="card grid-panel" aria-labelledby="generation-active-title">
        <h2 id="generation-active-title">Geração em andamento</h2>
        <p>
          <strong>{{ STATUS_TEXT[active.status].title }}.</strong>
          {{ STATUS_TEXT[active.status].text }}
        </p>
        <p aria-live="polite">{{ progress(active) }}</p>
        <div v-if="interactive && !active.cancelRequested" class="actions">
          <button type="button" class="danger" :disabled="busy" @click="cancel">
            Cancelar geração
          </button>
        </div>
      </section>

      <section v-if="detail" class="card grid-panel" aria-labelledby="generation-result-title">
        <h2 id="generation-result-title">{{ STATUS_TEXT[detail.run.status].title }}</h2>
        <p>{{ STATUS_TEXT[detail.run.status].text }}</p>
        <p v-if="detail.run.status === 'feasible' && STOP_TEXT[detail.run.reason ?? '']">
          {{ STOP_TEXT[detail.run.reason ?? ''] }}
        </p>
        <p class="muted">Prioridades: {{ orderText(detail.run.options.preferences) }}.</p>
        <p class="muted">
          Solicitada por {{ detail.run.requestedBy }} em {{ date(detail.run.requestedAt) }}
          <template v-if="detail.run.metrics">
            · busca de {{ seconds(detail.run.metrics.elapsedMs) }}</template
          >
          · semente {{ detail.run.options.seed }}
        </p>
        <p v-if="detail.run.appliedAt" class="success">
          Aplicada por {{ detail.run.appliedBy }} em {{ date(detail.run.appliedAt) }}.
        </p>
        <p v-else-if="detail.run.status === 'feasible' && detail.run.stale" class="error">
          Desatualizada: as aulas fixadas, as regras ou a revisão mudaram depois da solicitação.
          Gere novamente para aplicar.
        </p>
        <ul
          v-if="detail.run.diagnostics.length"
          class="issue-list"
          aria-label="Motivos informados pela geração"
        >
          <li v-for="(issue, index) in detail.run.diagnostics" :key="index">
            {{ issue.message }}
          </li>
        </ul>
        <ul v-if="detail.run.warnings.length" class="issue-list" aria-label="Alertas">
          <li v-for="(issue, index) in detail.run.warnings" :key="index">
            Alerta: {{ issue.message }}
          </li>
        </ul>

        <template v-if="comparison && proposal">
          <h3>Comparação com a grade atual</h3>
          <dl class="generation-summary">
            <div>
              <dt>Mantidas no lugar</dt>
              <dd>{{ comparison.kept }}</dd>
            </div>
            <div>
              <dt>Novas posições</dt>
              <dd>{{ comparison.added }}</dd>
            </div>
            <div>
              <dt>Retiradas</dt>
              <dd>{{ comparison.removed }}</dd>
            </div>
            <div>
              <dt>Janelas de professores</dt>
              <dd>
                {{ comparison.preferences.current.teacherWindows }} →
                {{ comparison.preferences.proposal.teacherWindows }}
              </dd>
            </div>
            <div>
              <dt>Disciplinas repetidas no dia</dt>
              <dd>
                {{ comparison.preferences.current.dailySpread }} →
                {{ comparison.preferences.proposal.dailySpread }}
              </dd>
            </div>
          </dl>
          <p class="hint">
            Os números vão da grade atual para a proposta; quanto menor, melhor. Janelas são aulas
            vagas entre duas atividades do professor no mesmo turno e dia. Repetições contam as
            aulas de uma disciplina da turma que caem num dia já usado por ela quando havia outro
            dia livre.
          </p>
          <div v-if="interactive && detail.applicable && !confirming" class="actions">
            <button type="button" :disabled="busy" @click="startApply">Aplicar proposta</button>
          </div>
          <section
            v-if="confirming"
            class="grid-panel grid-pending card"
            aria-labelledby="generation-confirm-title"
          >
            <h3 id="generation-confirm-title" tabindex="-1">Confirmar aplicação</h3>
            <p>
              A grade do rascunho passa a ser a proposta: {{ comparison.added }}
              {{ comparison.added === 1 ? 'alocação nova' : 'alocações novas' }} e
              {{ comparison.removed }}
              {{ comparison.removed === 1 ? 'retirada' : 'retiradas' }}. A proposta é conferida de
              novo antes de gravar, e a alteração pode ser desfeita no histórico da grade.
            </p>
            <div class="actions">
              <button type="button" :disabled="busy" @click="apply">Confirmar aplicação</button>
              <button type="button" class="ghost" @click="confirming = false">Cancelar</button>
            </div>
          </section>

          <dl class="grid-legend" aria-label="Legenda da proposta">
            <div>
              <dt aria-hidden="true">✚</dt>
              <dd>Muda em relação à grade atual</dd>
            </div>
            <div>
              <dt aria-hidden="true">📌</dt>
              <dd>Fixada: mantida pela geração</dd>
            </div>
            <div>
              <dt><span class="grid-swatch unavailable" aria-hidden="true"></span></dt>
              <dd>Professor indisponível</dd>
            </div>
          </dl>
          <fieldset class="checks grid-modes">
            <legend>Ver a proposta</legend>
            <label class="check"
              ><input v-model="mode" type="radio" value="class" /> Por turma</label
            >
            <label class="check"
              ><input v-model="mode" type="radio" value="teacher" /> Por professor</label
            >
          </fieldset>
          <template v-if="mode === 'class'">
            <label for="generation-class">Turma</label>
            <select id="generation-class" v-model="classGroupId">
              <option v-for="c in proposal.sortedClassGroups()" :key="c.id" :value="c.id">
                {{ c.name }}
              </option>
            </select>
            <GridMatrix
              :label="
                'Proposta para a turma ' + (proposal.classGroups.get(classGroupId)?.name ?? '')
              "
              :rows="classRows"
              :cell="classCell"
              :describe="describe"
              :has-problem="hasProblem"
              :is-changed="isChanged"
              :selected-key="null"
              :interactive="false"
            />
          </template>
          <template v-else>
            <label for="generation-teacher">Professor</label>
            <select id="generation-teacher" v-model="teacherId">
              <option v-for="t in proposal.sortedTeachers()" :key="t.id" :value="t.id">
                {{ t.name }}
              </option>
            </select>
            <div v-for="section in teacherSections" :key="section.shift.id" class="group">
              <h4 class="group-title">{{ section.shift.name }}</h4>
              <GridMatrix
                :label="
                  'Proposta para ' +
                  (proposal.teachers.get(teacherId)?.name ?? '') +
                  ' na ' +
                  section.shift.name
                "
                :rows="section.rows"
                :cell="teacherCell"
                :describe="describe"
                :has-problem="hasProblem"
                :is-changed="isChanged"
                :selected-key="null"
                :interactive="false"
              />
            </div>
          </template>
        </template>
      </section>

      <section class="card grid-panel" aria-labelledby="generation-history-title">
        <h2 id="generation-history-title">Gerações desta revisão</h2>
        <p v-if="list.runs.length === 0" class="muted">Nenhuma geração solicitada nesta revisão.</p>
        <div v-else class="matrix-wrapper">
          <table class="table" aria-label="Gerações desta revisão">
            <thead>
              <tr>
                <th scope="col">Solicitada em</th>
                <th scope="col">Por</th>
                <th scope="col">Resultado</th>
                <th scope="col"><span class="visually-hidden">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="run in list.runs" :key="run.id">
                <td>{{ date(run.requestedAt) }}</td>
                <td>{{ run.requestedBy }}</td>
                <td>{{ outcome(run) }}</td>
                <td class="actions">
                  <button
                    v-if="run.id !== active?.id"
                    type="button"
                    class="small ghost"
                    :aria-pressed="selectedId === run.id"
                    :aria-label="
                      'Ver o resultado da geração solicitada em ' + date(run.requestedAt)
                    "
                    @click="loadDetail(run.id).catch(fail)"
                  >
                    Ver
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </section>
</template>
