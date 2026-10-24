<script setup lang="ts">
import AssignmentParticipantsEditor from '../components/AssignmentParticipantsEditor.vue';
import AssignmentResourcesPicker from '../components/AssignmentResourcesPicker.vue';
import { useAssignmentsPage } from '../use-assignments-page.ts';
const {
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
} = useAssignmentsPage();
</script>

<template>
  <section aria-labelledby="assignments-title">
    <h1 id="assignments-title">Atribuições</h1>
    <p class="muted">
      Organize a carga da turma em blocos de aulas, com um ou mais professores no mesmo horário.
    </p>
    <p v-if="loadState === 'loading'" role="status">Carregando atribuições…</p>
    <div v-else-if="loadState === 'error'" role="alert">
      <p class="error">{{ loadError }}</p>
      <button type="button" @click="load">Tentar novamente</button>
    </div>
    <template v-else>
      <form
        v-if="canWrite"
        class="card"
        novalidate
        aria-labelledby="assignment-form-title"
        @submit.prevent="submit"
      >
        <h2 id="assignment-form-title" class="form-title">Novo bloco de aulas</h2>
        <div class="grid-form">
          <div>
            <label for="assignment-class-group">Turma</label>
            <select
              id="assignment-class-group"
              v-model="form.classGroupId"
              :disabled="saving || !canWrite"
            >
              <option value="">Escolha a turma</option>
              <option v-for="c in activeClassGroups" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div>
            <label for="assignment-lessons">Aulas por semana</label>
            <input
              id="assignment-lessons"
              v-model="form.weeklyLessons"
              type="number"
              inputmode="numeric"
              min="1"
              :max="MAX_WEEKLY_LESSONS"
              step="1"
              :disabled="saving || !canWrite"
            />
          </div>
        </div>
        <AssignmentParticipantsEditor
          v-model="form.participants"
          id-prefix="assignment"
          :subjects="subjects"
          :teachers="teachers"
          :disabled="saving || !canWrite"
        />
        <AssignmentResourcesPicker
          v-model="form.resourceIds"
          id-prefix="assignment"
          :resources="resources"
          :disabled="saving || !canWrite"
        />
        <p v-if="activeClassGroups.length === 0" class="hint">
          Nenhuma turma cadastrada. <RouterLink to="/turmas">Cadastre as turmas</RouterLink>.
        </p>
        <button type="submit" :disabled="saving || !canWrite">
          {{ saving ? 'Salvando…' : 'Atribuir' }}
        </button>
        <p
          v-if="formFeedback"
          :class="formFeedback.kind === 'error' ? 'error' : 'success'"
          :role="formFeedback.kind === 'error' ? 'alert' : 'status'"
        >
          {{ formFeedback.text }}
        </p>
      </form>
      <h2>Por turma</h2>
      <p
        v-if="listFeedback"
        :class="listFeedback.kind === 'error' ? 'error' : 'success'"
        :role="listFeedback.kind === 'error' ? 'alert' : 'status'"
      >
        {{ listFeedback.text }}
      </p>
      <p v-if="groups.length === 0">Nenhuma atribuição feita ainda.</p>
      <section
        v-for="group in groups"
        :key="group.classGroupId"
        class="card group"
        :aria-label="'Turma ' + group.name"
      >
        <h3 class="group-title">
          {{ group.name }} <span class="muted">— {{ lessonsLabel(group.total) }} por semana</span>
        </h3>
        <p class="hint">
          A carga da turma conta cada bloco uma vez; cada professor recebe a carga inteira do bloco
          em que participa.
        </p>
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Bloco</th>
              <th scope="col">Disciplina e professor</th>
              <th scope="col" class="num">Aulas/semana</th>
              <th scope="col"><span class="visually-hidden">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(assignment, index) in group.items" :key="assignment.id">
              <tr v-if="editing?.id === assignment.id">
                <td colspan="4">
                  <form
                    novalidate
                    :aria-label="'Editar bloco ' + (index + 1) + ' em ' + group.name"
                    @submit.prevent="saveEdit(assignment)"
                  >
                    <AssignmentParticipantsEditor
                      v-model="editing.participants"
                      :id-prefix="'edit-' + assignment.id"
                      :subjects="subjects"
                      :teachers="teachers"
                      :disabled="busy || !canWrite"
                    />
                    <AssignmentResourcesPicker
                      v-model="editing.resourceIds"
                      :id-prefix="'edit-' + assignment.id"
                      :resources="resources"
                      :disabled="busy || !canWrite"
                    />
                    <label :for="'edit-lessons-' + assignment.id"
                      >Aulas por semana do bloco {{ index + 1 }}</label
                    >
                    <input
                      :id="'edit-lessons-' + assignment.id"
                      v-model="editing.weeklyLessons"
                      class="lessons-input"
                      type="number"
                      min="1"
                      :max="MAX_WEEKLY_LESSONS"
                      step="1"
                      :disabled="busy || !canWrite"
                    />
                    <div class="form-actions">
                      <button type="submit" :disabled="busy || !canWrite">Salvar</button
                      ><button
                        type="button"
                        class="ghost"
                        :disabled="busy || !canWrite"
                        @click="editing = null"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                </td>
              </tr>
              <tr v-else>
                <th scope="row">{{ index + 1 }}</th>
                <td>
                  <div v-for="p in assignment.participants" :key="p.teacherId">
                    {{ subjectName(p.subjectId) }} — {{ teacherName(p.teacherId) }}
                  </div>
                  <div v-if="assignment.resourceIds.length" class="muted">
                    Recurso: {{ resourceNames(assignment) }}
                  </div>
                </td>
                <td class="num">{{ assignment.weeklyLessons }}</td>
                <td class="actions">
                  <template v-if="confirmingRemovalId === assignment.id">
                    <span>Remover bloco {{ index + 1 }}?</span>
                    <button
                      type="button"
                      class="small danger"
                      :aria-label="
                        'Confirmar remoção do bloco ' + (index + 1) + ' em ' + group.name
                      "
                      :disabled="busy || !canWrite"
                      @click="remove(assignment)"
                    >
                      Sim, remover
                    </button>
                    <button
                      type="button"
                      class="small ghost"
                      :disabled="busy || !canWrite"
                      @click="confirmingRemovalId = null"
                    >
                      Não
                    </button>
                  </template>
                  <template v-else>
                    <button
                      type="button"
                      class="small ghost"
                      :aria-label="'Editar bloco ' + (index + 1) + ' em ' + group.name"
                      :disabled="busy || !canWrite"
                      @click="startEdit(assignment)"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      class="small ghost"
                      :aria-label="'Remover bloco ' + (index + 1) + ' em ' + group.name"
                      :disabled="busy || !canWrite"
                      @click="
                        clearFeedback();
                        editing = null;
                        confirmingRemovalId = assignment.id;
                      "
                    >
                      Remover
                    </button>
                  </template>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </section>
      <p v-if="classGroupsWithoutAssignments.length > 0" class="muted">
        Turmas sem atribuições: {{ classGroupsWithoutAssignments.map((c) => c.name).join(', ') }}.
      </p>
      <h2>Carga por professor</h2>
      <p v-if="overloaded.length > 0" class="error">
        Acima da carga máxima:
        {{ overloaded.map((t) => t.name + ' (' + t.total + ' de ' + t.max + ')').join(', ') }}.
      </p>
      <p v-if="teacherLoads.length === 0">Nenhum professor cadastrado ainda.</p>
      <div v-else class="card group">
        <table class="table" aria-label="Carga semanal por professor">
          <thead>
            <tr>
              <th scope="col">Professor</th>
              <th scope="col" class="num">Aulas/semana</th>
              <th scope="col" class="num">Máximo</th>
              <th scope="col" class="num">Hora-atividade</th>
              <th scope="col" class="num">Turmas</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="teacherLoad in teacherLoads" :key="teacherLoad.id">
              <th scope="row">{{ teacherLoad.name }}</th>
              <td class="num" :class="{ error: teacherLoad.over }">
                {{ teacherLoad.total }}
                <span v-if="teacherLoad.over" class="visually-hidden">(acima do máximo)</span>
              </td>
              <td class="num">{{ teacherLoad.max ?? '—' }}</td>
              <td class="num">{{ teacherLoad.planning }}</td>
              <td class="num">{{ teacherLoad.classGroups }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
