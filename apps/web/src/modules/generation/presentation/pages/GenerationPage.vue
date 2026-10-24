<script setup lang="ts">
import { GridMatrix } from '../../../planning/index.ts';
import { useGenerationPage } from '../use-generation-page.ts';
const {
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
} = useGenerationPage();
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
