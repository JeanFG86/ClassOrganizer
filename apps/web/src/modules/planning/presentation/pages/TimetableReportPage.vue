<script setup lang="ts">
import { useTimetableReport } from '../use-timetable-report.ts';
import TimetableReportSheets from '../components/TimetableReportSheets.vue';
const {
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
} = useTimetableReport();
</script>
<template>
  <section class="report-page" aria-labelledby="report-title">
    <div class="report-controls">
      <p><RouterLink to="/planejamentos">Voltar aos planejamentos</RouterLink></p>
      <h1 id="report-title">Impressão e PDF</h1>
      <p>
        A impressão usa os dados da revisão selecionada. No diálogo do navegador, escolha a
        impressora ou Salvar como PDF. Cada turma ou professor tem folhas próprias por turno; folhas
        longas continuam nas páginas seguintes com identificação repetida.
      </p>
      <div class="card stack-form">
        <template v-if="report">
          <label for="report-revision">Revisão para imprimir</label>
          <select
            id="report-revision"
            :value="report.revision.id"
            :disabled="loading"
            @change="chooseRevision"
          >
            <option v-for="revision in report.revisions" :key="revision.id" :value="revision.id">
              Revisão {{ revision.number }}{{ revision.name ? ' - ' + revision.name : '' }}
            </option>
          </select>
        </template>
        <label for="report-perspective">Organizar por</label>
        <select
          id="report-perspective"
          v-model="perspective"
          :disabled="loading"
          @change="changePerspective"
        >
          <option value="class">Turma</option>
          <option value="teacher">Professor</option>
        </select>
        <template v-if="report">
          <label for="report-target">{{
            perspective === 'class' ? 'Turma para imprimir' : 'Professor para imprimir'
          }}</label>
          <select id="report-target" v-model="targetId" :disabled="loading" @change="load">
            <option value="">
              {{ perspective === 'class' ? 'Todas as turmas' : 'Todos os professores' }}
            </option>
            <option v-for="target in report.targets" :key="target.id" :value="target.id">
              {{ target.name }}
            </option>
          </select>
        </template>
        <div class="actions">
          <button :disabled="!ready" @click="print">Imprimir / salvar PDF</button
          ><button :disabled="loading" @click="load">Atualizar prévia</button>
        </div>
      </div>
      <p v-if="loading" role="status">Carregando a impressão…</p>
      <div v-if="error" role="alert" class="error">
        <p>{{ error }}</p>
        <button :disabled="loading" @click="load">Tentar novamente</button>
      </div>
      <template v-if="report && !loading && !error">
        <p v-if="!report.sheets.length">
          {{ perspective === 'class' ? 'Nenhuma turma' : 'Nenhum professor' }} nesta revisão.
        </p>
        <details v-if="report.notices.length">
          <summary>Pendências desta revisão ({{ report.notices.length }})</summary>
          <ul>
            <li v-for="(notice, index) in report.notices" :key="index">{{ notice }}</li>
          </ul>
        </details>
        <p role="status">
          Prévia carregada com os dados da revisão {{ report.revision.number }}. Use Atualizar
          prévia para incorporar alterações do rascunho.
        </p>
      </template>
    </div>
    <TimetableReportSheets v-if="report && !loading && !error" :report="report" />
  </section>
</template>
<style scoped>
.report-page {
  min-width: 0;
}
.report-controls select {
  max-width: 100%;
  width: 100%;
  min-width: 0;
}
.report-controls p,
.report-controls li {
  overflow-wrap: anywhere;
}
</style>
