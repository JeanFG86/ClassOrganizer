<script setup lang="ts">
import GridDiagnosis from '../components/GridDiagnosis.vue';
import GridMatrix from '../components/GridMatrix.vue';
import GridRulesForm from '../components/GridRulesForm.vue';
import { useGridPage } from '../use-grid-page.ts';
const {
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
} = useGridPage();
</script>

<template>
  <section aria-labelledby="grid-title">
    <p><RouterLink to="/planejamentos">← Planejamentos</RouterLink></p>
    <p v-if="loadState === 'loading'" role="status">Carregando a grade…</p>
    <div v-else-if="loadState === 'error'" role="alert">
      <h1 id="grid-title">Grade</h1>
      <p class="error">{{ loadError }}</p>
      <button type="button" @click="load">Tentar novamente</button>
    </div>
    <template v-else-if="view && lookup">
      <h1 id="grid-title">Grade · {{ view.planning.name }} · {{ view.planning.year }}</h1>
      <p>
        <RouterLink
          :to="{
            path: '/planejamentos/' + view.planning.id + '/impressoes',
            query: { revisao: view.revision.id },
          }"
          >Imprimir ou salvar PDF desta revisão</RouterLink
        >
      </p>
      <div class="card grid-header">
        <label for="grid-revision">Revisão</label>
        <select id="grid-revision" :value="view.revision.id" @change="chooseRevision">
          <option v-for="r in view.revisions" :key="r.id" :value="r.id">
            Revisão {{ r.number }} · {{ r.sealedAt ? 'Concluída' : 'Rascunho' }}
          </option>
        </select>
        <p v-if="!view.editable" class="hint">
          {{
            view.planning.archivedAt
              ? 'Planejamento arquivado: a grade fica disponível só para consulta.'
              : view.revision.sealedAt
                ? 'Revisão concluída: a grade não pode mais ser alterada. Abra um novo rascunho em Planejamentos.'
                : 'Revisão anterior: somente consulta.'
          }}
        </p>
        <p v-else-if="!canWrite" class="hint">Seu perfil permite apenas consultar a grade.</p>
        <p v-else class="hint">
          Escolha uma aula para selecioná-la; depois escolha um horário livre para movê-la ou outra
          aula para trocar as duas. Em um horário livre sem seleção, escolha o que inserir. Toda
          alteração mostra o diagnóstico antes da confirmação.
        </p>
        <p v-if="view.revisions.at(-1)?.id === view.revision.id">
          <RouterLink :to="'/planejamentos/' + view.planning.id + '/geracao'"
            >Geração automática</RouterLink
          >: monta uma proposta completa respeitando as aulas fixadas.
        </p>
      </div>

      <dl class="grid-legend" aria-label="Legenda">
        <div>
          <dt aria-hidden="true">📌</dt>
          <dd>Fixada: não sai do lugar até ser desfixada</dd>
        </div>
        <div>
          <dt aria-hidden="true">⚠</dt>
          <dd>Com problema na conferência</dd>
        </div>
        <div>
          <dt><span class="grid-swatch selected" aria-hidden="true"></span></dt>
          <dd>Selecionada</dd>
        </div>
        <div>
          <dt><span class="grid-swatch unavailable" aria-hidden="true"></span></dt>
          <dd>Professor indisponível</dd>
        </div>
      </dl>

      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <p v-if="status" role="status" class="success">{{ status }}</p>

      <fieldset class="checks grid-modes">
        <legend>Visão</legend>
        <label class="check"><input v-model="mode" type="radio" value="class" /> Por turma</label>
        <label class="check"
          ><input v-model="mode" type="radio" value="teacher" /> Por professor</label
        >
        <label class="check"
          ><input v-model="mode" type="radio" value="overview" /> Visão geral</label
        >
      </fieldset>

      <p v-if="view.timetable.classGroups.length === 0" class="card">
        Nenhuma turma com turno e aulas nesta revisão. Cadastre turnos, turmas e atribuições e abra
        um novo rascunho.
      </p>

      <template v-else-if="mode === 'class'">
        <div class="card">
          <label for="grid-class">Turma</label>
          <select id="grid-class" v-model="classGroupId">
            <option v-for="c in lookup.sortedClassGroups()" :key="c.id" :value="c.id">
              {{ c.name }}
            </option>
          </select>
        </div>
        <section class="card group">
          <GridMatrix
            :label="'Grade da turma ' + (lookup.classGroups.get(classGroupId)?.name ?? '')"
            :rows="classRows"
            :cell="classCell"
            :describe="describe"
            :has-problem="hasProblem"
            :selected-key="selectedKey"
            :interactive="interactive"
            @pick="pick"
            @empty="empty"
          />
        </section>
      </template>

      <template v-else-if="mode === 'teacher'">
        <div class="card">
          <label for="grid-teacher">Professor</label>
          <select id="grid-teacher" v-model="teacherId">
            <option v-for="t in lookup.sortedTeachers()" :key="t.id" :value="t.id">
              {{ t.name }}
            </option>
          </select>
        </div>
        <section
          v-for="section in teacherSections"
          :key="section.shift.id"
          class="card group"
          :aria-label="section.shift.name"
        >
          <h2 class="group-title">{{ section.shift.name }}</h2>
          <GridMatrix
            :label="
              'Grade de ' +
              (lookup.teachers.get(teacherId)?.name ?? '') +
              ' na ' +
              section.shift.name
            "
            :rows="section.rows"
            :cell="teacherCell"
            :describe="describe"
            :has-problem="hasProblem"
            :selected-key="selectedKey"
            :interactive="interactive"
            @pick="pick"
            @empty="empty"
          />
        </section>
      </template>

      <template v-else>
        <div class="card grid-filters">
          <div>
            <label for="grid-shift">Turno</label>
            <select id="grid-shift" v-model="shiftId">
              <option v-for="s in view.shifts" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>
          <div>
            <label for="grid-day">Dia</label>
            <select id="grid-day" v-model.number="weekday">
              <option v-for="d in GRID_WEEKDAYS" :key="d.value" :value="d.value">
                {{ d.long }}
              </option>
            </select>
          </div>
        </div>
        <section class="card group">
          <div class="matrix-wrapper">
            <table
              class="table matrix grid-matrix"
              :aria-label="'Visão geral: ' + (overviewShift?.name ?? '') + ', ' + dayName(weekday)"
            >
              <thead>
                <tr>
                  <th scope="col">Turma</th>
                  <th
                    v-for="row in lookup.rows(overviewShift?.periodIds ?? [])"
                    :key="row.periodId"
                    scope="col"
                  >
                    {{ row.label }} <span class="muted grid-time">{{ row.time }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in overviewClasses" :key="c.id">
                  <th scope="row">
                    <button
                      type="button"
                      class="small ghost"
                      :aria-label="'Abrir a grade da turma ' + c.name"
                      @click="
                        classGroupId = c.id;
                        mode = 'class';
                      "
                    >
                      {{ c.name }}
                    </button>
                  </th>
                  <td v-for="periodId in overviewShift?.periodIds ?? []" :key="periodId">
                    <template v-if="c.periodIds.includes(periodId)">
                      <div
                        v-for="item in lookup.classItems(c.id, weekday, periodId)"
                        :key="placementKey(item.placement)"
                        class="grid-item"
                        :class="{ conflict: hasProblem(item) }"
                      >
                        <span class="grid-item-title">{{ item.title }}</span>
                        <span class="grid-item-detail">{{ item.detail }}</span>
                        <span class="grid-flags" aria-hidden="true"
                          >{{ item.placement.pinned ? '📌' : ''
                          }}{{ hasProblem(item) ? '⚠' : '' }}</span
                        >
                      </div>
                      <span
                        v-if="lookup.classItems(c.id, weekday, periodId).length === 0"
                        class="muted grid-empty-text"
                        >Livre</span
                      >
                    </template>
                    <span v-else class="muted grid-empty-text" aria-label="Sem aula nesta turma"
                      >·</span
                    >
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>

      <section v-if="chooser" class="card grid-panel" aria-labelledby="grid-chooser-title">
        <h2 id="grid-chooser-title" tabindex="-1">
          Inserir na {{ dayName(chooser.weekday) }}, {{ lookup.time(chooser.periodId) }}
        </h2>
        <p v-if="chooser.candidates.length === 0">
          Nada a inserir: todas as aulas e horas-atividade desta visão já estão na grade.
        </p>
        <ul v-else class="list" aria-label="Opções para inserir">
          <li v-for="c in chooser.candidates" :key="c.kind + c.entityId" class="item">
            <span class="item-name">{{ c.label }} · faltam {{ c.remaining }}</span>
            <button
              type="button"
              class="small"
              :disabled="busy"
              :aria-label="'Inserir ' + c.label"
              @click="insert(c)"
            >
              Inserir
            </button>
          </li>
        </ul>
        <button type="button" class="ghost" @click="chooser = null">Cancelar</button>
      </section>

      <section
        v-if="selected && !pending"
        class="card grid-panel"
        aria-labelledby="grid-selected-title"
      >
        <h2 id="grid-selected-title">Aula selecionada</h2>
        <p>{{ lookup.describe(selected) }}{{ selected.pinned ? ' · fixada' : '' }}</p>
        <p class="hint">
          {{
            selected.pinned
              ? 'Desfixe para mover, trocar ou remover.'
              : 'Escolha um horário livre para mover ou outra aula para trocar.'
          }}
        </p>
        <div class="actions">
          <button
            type="button"
            :disabled="busy"
            @click="preview({ type: 'pin', slot: slot(selected), pinned: !selected.pinned })"
          >
            {{ selected.pinned ? 'Desfixar' : 'Fixar' }}
          </button>
          <button
            type="button"
            class="danger"
            :disabled="busy || selected.pinned"
            @click="preview({ type: 'remove', slot: slot(selected) })"
          >
            Remover da grade
          </button>
          <button type="button" class="ghost" @click="selected = null">Cancelar seleção</button>
        </div>
      </section>

      <section
        v-if="pending"
        class="card grid-panel grid-pending"
        aria-labelledby="grid-pending-title"
      >
        <h2 id="grid-pending-title" tabindex="-1">Confirmar alteração</h2>
        <p>{{ pending.evaluation.summary }}</p>
        <template v-if="pending.evaluation.accepted">
          <p class="success">Nenhum problema novo.</p>
          <ul
            v-if="pending.evaluation.resolved.length"
            class="issue-list"
            aria-label="Problemas resolvidos"
          >
            <li v-for="(issue, index) in pending.evaluation.resolved" :key="index">
              Resolve: {{ issue.message }}
            </li>
          </ul>
        </template>
        <template v-else>
          <p class="error">A alteração não pode ser aplicada porque criaria:</p>
          <ul class="issue-list" aria-label="Problemas que a alteração criaria">
            <li
              v-for="(issue, index) in pending.evaluation.introduced.length
                ? pending.evaluation.introduced
                : pending.evaluation.diagnosis.model"
              :key="index"
              class="error"
            >
              {{ issue.message }}
            </li>
          </ul>
        </template>
        <div class="actions">
          <button type="button" :disabled="busy || !pending.evaluation.accepted" @click="confirm">
            Confirmar alteração
          </button>
          <button type="button" class="ghost" @click="reset">Cancelar</button>
        </div>
      </section>

      <GridDiagnosis :view="view" :lookup="lookup" />

      <section class="card grid-panel" aria-labelledby="grid-history-title">
        <h2 id="grid-history-title">Histórico da revisão</h2>
        <div v-if="view.undo && interactive" class="actions">
          <button type="button" :disabled="busy" @click="undo">Desfazer última alteração</button>
        </div>
        <p v-if="view.undo && interactive" class="hint">Desfaz: {{ view.undo.summary }}</p>
        <p v-if="view.history.length === 0" class="muted">Nenhuma alteração nesta revisão.</p>
        <ol v-else class="list grid-history" aria-label="Alterações da grade" reversed>
          <li v-for="entry in view.history.toReversed()" :key="entry.id">
            {{ entry.summary }}
            <span class="muted"
              >— {{ entry.actorUsername }}, {{ date(entry.occurredAt)
              }}{{ entry.reverted ? ' · desfeita' : '' }}</span
            >
          </li>
        </ol>
      </section>

      <GridRulesForm
        :rules="view.rules"
        :lookup="lookup"
        :editable="interactive"
        :busy="busy"
        @save="saveRules"
      />
    </template>
  </section>
</template>
