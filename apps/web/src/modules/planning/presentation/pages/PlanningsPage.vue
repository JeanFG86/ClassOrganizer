<script setup lang="ts">
import { planningsApiKey } from '../plannings-key.ts';
import { computed, onMounted, ref, shallowRef } from 'vue';
import type { PlanningDto, PlanningDetailDto, RevisionDto } from '@classorganizer/contracts';
import { accessApiKey } from '../../../access/index.ts';
import { injectRequired } from '../../../../shared/presentation/inject-required.ts';
import { errorMessage } from '../../../../shared/presentation/feedback.ts';
import PlanningSnapshotView from '../components/PlanningSnapshotView.vue';
import PlanningVersionsPanel from '../components/PlanningVersionsPanel.vue';
const api = injectRequired(planningsApiKey);
const access = injectRequired(accessApiKey);
const canWrite = computed(
  () => access.session.value?.user.role === 'admin' || access.session.value?.user.role === 'editor',
);
const admin = computed(() => access.session.value?.user.role === 'admin');
const items = ref<PlanningDto[]>([]);
const detail = shallowRef<PlanningDetailDto | null>(null);
const name = ref('');
const year = ref(new Date().getFullYear());
const source = ref<PlanningDto | null>(null);
const loading = ref(true);
const loadError = ref('');
const error = ref('');
const status = ref('');
const busy = ref(false);
const rulesReviewed = ref(false);
const availabilityReviewed = ref(false);
const latest = computed(() => detail.value?.revisions.at(-1));
async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    items.value = await api.plannings();
  } catch (cause) {
    loadError.value = errorMessage(cause);
  } finally {
    loading.value = false;
  }
}
async function open(id: string) {
  busy.value = true;
  error.value = '';
  try {
    detail.value = await api.planning(id);
    rulesReviewed.value = latest.value?.rulesReviewed ?? false;
    availabilityReviewed.value = latest.value?.availabilityReviewed ?? false;
  } catch (cause) {
    error.value = errorMessage(cause);
    detail.value = null;
  } finally {
    busy.value = false;
  }
}
async function refreshDetail() {
  const id = detail.value?.id;
  if (id) await open(id);
  await load();
}
function copy(item: PlanningDto) {
  source.value = item;
  name.value = item.name + ' — cópia';
  document.getElementById('planning-name')?.focus();
}
async function create() {
  busy.value = true;
  error.value = '';
  status.value = '';
  try {
    const created = await api.createPlanning({
      name: name.value,
      year: year.value,
      ...(source.value ? { sourceId: source.value.id, sourceVersion: source.value.version } : {}),
    });
    name.value = '';
    source.value = null;
    status.value = 'Planejamento criado. Revise as regras e a disponibilidade do rascunho.';
    await load();
    await open(created.id);
  } catch (cause) {
    error.value = errorMessage(cause);
    await load();
    source.value = null;
  } finally {
    busy.value = false;
  }
}
async function change(operation: 'draft' | 'review' | 'seal' | 'archive' | 'restore') {
  const current = detail.value;
  if (!current) return;
  busy.value = true;
  error.value = '';
  status.value = '';
  try {
    await api.changePlanning(current.id, {
      version: current.version,
      operation,
      revisionId: latest.value?.id,
      ...(operation === 'review'
        ? { rulesReviewed: rulesReviewed.value, availabilityReviewed: availabilityReviewed.value }
        : {}),
    });
    status.value =
      operation === 'draft'
        ? 'Novo rascunho criado com os cadastros atuais. Revise novamente as regras e a disponibilidade.'
        : 'Planejamento atualizado.';
    await open(current.id);
    await load();
  } catch (cause) {
    const message = errorMessage(cause);
    await open(current.id);
    error.value = message;
    await load();
  } finally {
    busy.value = false;
  }
}
function download(revision: RevisionDto) {
  const blob = new Blob([JSON.stringify(revision, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'planejamento-' + revision.planningId + '-revisao-' + revision.number + '.json';
  link.click();
  URL.revokeObjectURL(url);
}
function date(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}
onMounted(load);
</script>
<template>
  <section aria-labelledby="plannings-title">
    <h1 id="plannings-title">Planejamentos</h1>
    <p>
      Cada revisão guarda os cadastros, cargas, horários e disponibilidades daquele momento.
      Alterações nos cadastros entram ao criar outro rascunho.
    </p>
    <form v-if="canWrite" class="card stack-form" @submit.prevent="create">
      <h2>{{ source ? 'Copiar planejamento' : 'Criar planejamento' }}</h2>
      <p v-if="source">
        Origem: {{ source.name }}. A cópia exige nova conferência das regras e da disponibilidade.
      </p>
      <label for="planning-name">Nome do planejamento</label
      ><input id="planning-name" v-model="name" maxlength="100" required />
      <label for="planning-year">Ano</label
      ><input
        id="planning-year"
        v-model.number="year"
        type="number"
        min="2000"
        max="2200"
        required
      />
      <div class="actions">
        <button :disabled="busy">{{ source ? 'Criar cópia' : 'Criar planejamento' }}</button
        ><button v-if="source" type="button" @click="source = null">Cancelar cópia</button>
      </div>
    </form>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="status" role="status">{{ status }}</p>
    <p v-if="loading" role="status">Carregando planejamentos…</p>
    <div v-else-if="loadError" role="alert">
      <p>{{ loadError }}</p>
      <button @click="load">Tentar novamente</button>
    </div>
    <p v-else-if="items.length === 0">Nenhum planejamento criado ainda.</p>
    <ul v-else class="list" aria-label="Planejamentos cadastrados">
      <li v-for="item in items" :key="item.id" class="item">
        <span class="item-name"
          >{{ item.name }} · {{ item.year }}{{ item.archivedAt ? ' · Arquivado' : '' }}</span
        >
        <div class="actions">
          <button :aria-label="'Abrir ' + item.name" :disabled="busy" @click="open(item.id)">
            Abrir</button
          ><button
            v-if="canWrite"
            :aria-label="'Copiar ' + item.name"
            :disabled="busy"
            @click="copy(item)"
          >
            Copiar
          </button>
        </div>
      </li>
    </ul>
    <section v-if="detail" aria-labelledby="planning-detail-title" class="card revision-card">
      <h2 id="planning-detail-title">{{ detail.name }} · {{ detail.year }}</h2>
      <p v-if="detail.archivedAt">
        Planejamento arquivado. As revisões continuam disponíveis para consulta.
      </p>
      <div v-if="admin" class="actions">
        <button :disabled="busy" @click="change(detail.archivedAt ? 'restore' : 'archive')">
          {{ detail.archivedAt ? 'Restaurar planejamento' : 'Arquivar planejamento' }}
        </button>
      </div>
      <p v-if="detail.copiedFromId" class="muted">
        Criado a partir de uma cópia. As conferências são independentes da origem.
      </p>
      <PlanningVersionsPanel :planning="detail" :can-write="canWrite" @changed="refreshDetail" />
      <article
        v-for="revision in detail.revisions"
        :key="revision.id"
        class="card revision-card"
        :aria-label="'Revisão ' + revision.number"
      >
        <h3>Revisão {{ revision.number }} · {{ revision.sealedAt ? 'Concluída' : 'Rascunho' }}</h3>
        <p v-if="revision.name">
          <strong>{{ revision.name }}</strong>
        </p>
        <p v-if="revision.restoredFromId">
          Restaurada da revisão
          {{ detail.revisions.find((r) => r.id === revision.restoredFromId)?.number }}.
        </p>
        <p v-if="revision.id !== latest?.id && !revision.sealedAt" class="muted">
          Rascunho preservado no histórico; disponível somente para consulta ou restauração.
        </p>
        <p>
          Hora-atividade:
          {{
            revision.gridRules.planningPeriods === 'any_shift'
              ? 'qualquer turno'
              : 'turnos com aulas do professor'
          }}. Limite diário: {{ revision.gridRules.daily.maxPerDay }} aula(s) da mesma disciplina{{
            revision.gridRules.daily.consecutive ? ', consecutivas' : ''
          }}. {{ revision.gridRules.dailyExceptions.length }} exceção(ões).
        </p>
        <p>
          Capturada em {{ date(revision.snapshot.capturedAt) }}. Base dos cadastros: versão
          {{ revision.snapshot.catalogVersion }}.
        </p>
        <p>
          {{ revision.snapshot.subjects.length }} disciplinas ·
          {{ revision.snapshot.teachers.length }} professores ·
          {{ revision.snapshot.classGroups.length }} turmas ·
          {{ revision.snapshot.shifts.length }} turnos ·
          {{ revision.snapshot.assignments.length }} atribuições.
        </p>
        <p>
          Regras: {{ revision.rulesReviewed ? 'conferidas' : 'revisão necessária' }}.
          Disponibilidade: {{ revision.availabilityReviewed ? 'conferida' : 'revisão necessária' }}.
        </p>
        <details>
          <summary>Consultar dados desta revisão</summary>
          <p>
            A conferência inclui horários, cargas, hora-atividade, habilitações, atribuições e as
            regras da grade (limite diário e onde cumprir hora-atividade).
          </p>
          <PlanningSnapshotView :snapshot="revision.snapshot" />
        </details>
        <div class="actions">
          <RouterLink
            class="button"
            :to="{
              path: '/planejamentos/' + detail.id + '/grade',
              query: revision.id === latest?.id ? {} : { revisao: revision.id },
            }"
            :aria-label="'Abrir grade da revisão ' + revision.number"
            >Abrir grade</RouterLink
          ><RouterLink
            v-if="revision.id === latest?.id"
            class="button"
            :to="'/planejamentos/' + detail.id + '/geracao'"
            :aria-label="'Abrir geração automática da revisão ' + revision.number"
            >Geração automática</RouterLink
          ><button :aria-label="'Baixar revisão ' + revision.number" @click="download(revision)">
            Baixar revisão em JSON
          </button>
        </div>
      </article>
      <form
        v-if="latest && !latest.sealedAt && !detail.archivedAt && canWrite"
        class="stack-form"
        @submit.prevent="change('review')"
      >
        <h3>Conferência do rascunho</h3>
        <label
          ><input v-model="rulesReviewed" type="checkbox" /> Conferi as regras e cargas desta
          revisão</label
        >
        <label
          ><input v-model="availabilityReviewed" type="checkbox" /> Conferi a disponibilidade e a
          hora-atividade desta revisão</label
        >
        <div class="actions">
          <button :disabled="busy">Salvar conferência</button
          ><button
            type="button"
            :disabled="busy || !latest.rulesReviewed || !latest.availabilityReviewed"
            @click="change('seal')"
          >
            Concluir revisão
          </button>
        </div>
        <p class="muted">
          Concluir exige a grade completa e sem problemas e congela a revisão. Isso ainda não
          publica a grade.
        </p>
      </form>
      <button
        v-if="latest?.sealedAt && !detail.archivedAt && canWrite"
        :disabled="busy"
        @click="change('draft')"
      >
        Novo rascunho com os cadastros atuais
      </button>
    </section>
  </section>
</template>
