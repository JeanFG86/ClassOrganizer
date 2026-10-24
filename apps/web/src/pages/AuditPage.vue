<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { z } from 'zod';
import type { auditsSchema } from '@classorganizer/contracts';
import { accessApiKey } from '../services/access-api.ts';
import { injectRequired } from '../services/inject-required.ts';
import { errorMessage } from '../services/feedback.ts';
const api = injectRequired(accessApiKey);
const items = ref<z.infer<typeof auditsSchema>>([]);
const error = ref('');
const loading = ref(true);
const actions: Record<string, string> = {
  'access.bootstrap': 'Criação do primeiro administrador',
  'access.login': 'Entrada',
  'access.logout': 'Saída',
  'access.createUser': 'Criação de acesso',
  'access.changeUser': 'Alteração de acesso',
  'access.changePassword': 'Troca de senha',
  'planning.create': 'Criação de planejamento',
  'planning.copy': 'Cópia de planejamento',
  'planning.review': 'Conferência de revisão',
  'planning.seal': 'Conclusão de revisão',
  'planning.draft': 'Abertura de rascunho',
  'planning.archive': 'Arquivamento de planejamento',
  'planning.restore': 'Restauração de planejamento',
  'planning.grid': 'Alteração da grade',
  'planning.gridUndo': 'Desfazer alteração da grade',
  'planning.gridRules': 'Alteração das regras da grade',
  'planning.generationRequest': 'Solicitação de geração automática',
  'planning.generationCancel': 'Cancelamento de geração automática',
  'planning.generationApply': 'Aplicação de proposta gerada',
};
const catalogActions: Record<string, string> = {
  registerSubject: 'Cadastro de disciplina',
  updateSubject: 'Alteração de disciplina',
  archiveSubject: 'Arquivamento de disciplina',
  restoreSubject: 'Restauração de disciplina',
  registerTeacher: 'Cadastro de professor',
  updateTeacher: 'Alteração de professor',
  archiveTeacher: 'Arquivamento de professor',
  restoreTeacher: 'Restauração de professor',
  changeTeacherAvailability: 'Alteração de disponibilidade',
  registerClassGroup: 'Cadastro de turma',
  updateClassGroup: 'Alteração de turma',
  changeClassGroupSchedule: 'Alteração dos horários da turma',
  archiveClassGroup: 'Arquivamento de turma',
  restoreClassGroup: 'Restauração de turma',
  registerShift: 'Cadastro de turno',
  updateShift: 'Alteração de turno',
  archiveShift: 'Arquivamento de turno',
  restoreShift: 'Restauração de turno',
  assignTeaching: 'Criação de atribuição',
  changeAssignment: 'Alteração de atribuição',
  removeAssignment: 'Remoção de atribuição',
};
function label(action: string) {
  return (
    actions[action] ?? catalogActions[action.replace('catalog.', '')] ?? 'Alteração registrada'
  );
}
async function load(older = false) {
  loading.value = true;
  error.value = '';
  try {
    const rows = await api.audits(older ? items.value.at(-1) : undefined);
    items.value = older ? [...items.value, ...rows] : rows;
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    loading.value = false;
  }
}
onMounted(() => load());
</script>
<template>
  <section aria-labelledby="audit-title">
    <h1 id="audit-title">Auditoria</h1>
    <p>
      Histórico de acessos e alterações, com o usuário responsável. Senhas e tokens não são
      registrados.
    </p>
    <p v-if="error" role="alert" class="error">
      {{ error }} <button @click="load()">Tentar novamente</button>
    </p>
    <p v-if="loading" role="status">Carregando histórico…</p>
    <p v-if="!loading && !error && items.length === 0">Nenhum evento registrado.</p>
    <ol class="list" aria-label="Histórico de alterações">
      <li v-for="item in items" :key="item.id" class="card revision-card">
        <strong>{{ label(item.action) }}</strong>
        <p>{{ item.actor.username }} · {{ new Date(item.occurredAt).toLocaleString('pt-BR') }}</p>
        <p v-if="item.entityId" class="muted">Registro: {{ item.entityId }}</p>
      </li>
    </ol>
    <button v-if="items.length >= 100" :disabled="loading" @click="load(true)">
      Carregar eventos anteriores
    </button>
  </section>
</template>
