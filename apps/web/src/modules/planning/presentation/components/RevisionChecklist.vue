<script setup lang="ts">
import { computed } from 'vue';
import {
  REVIEW_ITEMS,
  type PlanningDetailDto,
  type ReviewItemDto,
  type RevisionDto,
} from '@classorganizer/contracts';
import { useRevisionChecklist } from '../use-revision-checklist.ts';
const props = defineProps<{
  planning: PlanningDetailDto;
  revision: RevisionDto;
  /** Permite marcar e salvar os itens: perfil de edição e rascunho atual ativo. */
  editable: boolean;
  busy: boolean;
}>();
const emit = defineEmits<{ save: [items: ReviewItemDto[]]; seal: [] }>();
const { checklist, loading, error, selected, retry } = useRevisionChecklist(props);
const saved = computed(() => props.revision.reviewedItems.length);
const reviewed = computed(() =>
  REVIEW_ITEMS.every((i) => props.revision.reviewedItems.includes(i)),
);
const kinds = { added: 'Incluído', removed: 'Removido', changed: 'Alterado' };
const ATTENTION_OPEN_LIMIT = 3;
</script>
<template>
  <section class="card stack-form" aria-labelledby="checklist-title">
    <h3 id="checklist-title">Checklist de conferência</h3>
    <p>
      Revisão {{ revision.number }}: {{ saved }} de {{ REVIEW_ITEMS.length }} itens conferidos.
      Confira cada item nos dados desta revisão antes de concluir.
    </p>
    <p v-if="checklist?.reference">
      As alterações são comparadas com {{ checklist.reference.label }}. Itens sem alterações também
      precisam ser confirmados para o novo período.
    </p>
    <p v-else-if="checklist" class="muted">
      Primeira revisão, sem outra revisão para comparar. Confira todos os dados.
    </p>
    <p v-if="loading" role="status">Carregando checklist…</p>
    <div v-else-if="error" role="alert">
      <p>{{ error }}</p>
      <button type="button" @click="retry">Tentar novamente</button>
    </div>
    <component
      :is="editable ? 'form' : 'div'"
      v-if="checklist"
      class="stack-form"
      @submit.prevent="emit('save', selected)"
    >
      <ul class="checklist" aria-label="Itens da conferência">
        <li v-for="entry in checklist.items" :key="entry.item" class="checklist-item">
          <label v-if="editable"
            ><input v-model="selected" type="checkbox" :value="entry.item" :disabled="busy" />
            {{ entry.title }}</label
          >
          <p v-else>
            <strong>{{ entry.title }}</strong> · {{ entry.reviewed ? 'Conferido' : 'Pendente' }}
          </p>
          <p class="muted">{{ entry.description }}</p>
          <!-- Listas curtas ficam abertas; as longas não empurram os demais itens para longe. -->
          <details
            v-if="entry.attention.length"
            class="attention"
            :open="entry.attention.length <= ATTENTION_OPEN_LIMIT"
          >
            <summary>
              {{ entry.attention.length }}
              {{ entry.attention.length === 1 ? 'ponto de atenção' : 'pontos de atenção' }}
            </summary>
            <ul :aria-label="'Pontos de atenção: ' + entry.title">
              <li v-for="(message, index) in entry.attention" :key="index">{{ message }}</li>
            </ul>
          </details>
          <template v-if="checklist.reference">
            <details v-if="entry.changes.length">
              <summary>
                {{ entry.changes.length }}
                {{ entry.changes.length === 1 ? 'alteração' : 'alterações' }} desde
                {{ checklist.reference.label }}
              </summary>
              <ul :aria-label="'Alterações: ' + entry.title">
                <li v-for="(change, index) in entry.changes" :key="index">
                  {{ kinds[change.kind] }}: {{ change.label
                  }}{{ change.fields.length ? ' (' + change.fields.join(', ') + ')' : '' }}
                </li>
              </ul>
            </details>
            <p v-else class="muted">Sem alterações desde {{ checklist.reference.label }}.</p>
          </template>
        </li>
      </ul>
      <div v-if="editable" class="actions">
        <button :disabled="busy">Salvar conferência</button
        ><button type="button" :disabled="busy || !reviewed" @click="emit('seal')">
          Concluir revisão
        </button>
      </div>
      <p v-if="editable" class="muted">
        Os pontos de atenção não impedem a conclusão. Concluir exige todos os itens conferidos e a
        grade completa e sem problemas, e congela a revisão. Isso ainda não publica a grade.
      </p>
    </component>
  </section>
</template>
<style scoped>
.checklist {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}
.checklist-item {
  border-top: 1px solid var(--border);
  padding-top: 0.5rem;
  overflow-wrap: anywhere;
}
.checklist-item p {
  margin: 0.25rem 0;
}
</style>
