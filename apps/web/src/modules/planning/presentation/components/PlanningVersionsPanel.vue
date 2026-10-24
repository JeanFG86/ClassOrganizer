<script setup lang="ts">
import type { PlanningDetailDto } from '@classorganizer/contracts';
import { usePlanningVersions } from '../use-planning-versions.ts';
const props = defineProps<{ planning: PlanningDetailDto; canWrite: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const {
  selectedId,
  targetId,
  name,
  busy,
  error,
  status,
  comparison,
  confirming,
  selected,
  latest,
  editable,
  rename,
  restore,
  preserve,
  compare,
  retry,
} = usePlanningVersions(props, () => emit('changed'));
const kinds = { added: 'Incluído', removed: 'Removido', changed: 'Alterado' };
</script>
<template>
  <section class="card stack-form" aria-labelledby="versions-title">
    <h3 id="versions-title">Versões do planejamento</h3>
    <label for="version-source">Revisão de origem</label>
    <select id="version-source" v-model="selectedId" :disabled="busy">
      <option v-for="revision in planning.revisions" :key="revision.id" :value="revision.id">
        Revisão {{ revision.number }}{{ revision.name ? ' — ' + revision.name : '' }}
      </option>
    </select>
    <form v-if="editable" class="stack-form" @submit.prevent="rename">
      <label for="revision-name">Nome da revisão (opcional)</label>
      <input id="revision-name" v-model="name" maxlength="100" :disabled="busy" />
      <button :disabled="busy">Salvar nome da revisão</button>
    </form>
    <label for="version-target">Comparar com a revisão</label>
    <select id="version-target" v-model="targetId" :disabled="busy">
      <option v-for="revision in planning.revisions" :key="revision.id" :value="revision.id">
        Revisão {{ revision.number }}{{ revision.name ? ' — ' + revision.name : '' }}
      </option>
    </select>
    <button :disabled="busy || !selected || !targetId" @click="compare">Comparar revisões</button>
    <p v-if="busy" role="status">Processando revisão…</p>
    <p v-if="error" role="alert" class="error">
      {{ error }} <button :disabled="busy" @click="retry">Tentar novamente</button>
    </p>
    <p v-if="status" role="status">{{ status }}</p>
    <div v-if="editable && selected?.id === latest?.id && !selected?.sealedAt">
      <p>
        Preserve esta revisão para comparar alternativas sem concluir a grade. Uma cópia dos mesmos
        dados, regras e alocações será aberta como novo rascunho.
      </p>
      <button :disabled="busy" @click="preserve">Preservar revisão e continuar</button>
    </div>
    <section v-if="comparison" aria-labelledby="comparison-title">
      <h4 id="comparison-title">
        Da revisão {{ comparison.from.number }} para a revisão {{ comparison.to.number }}
      </h4>
      <p>
        {{ comparison.kept }} alocações mantidas · {{ comparison.removed.length }} removidas ·
        {{ comparison.added.length }} incluídas.
      </p>
      <p>
        {{
          comparison.rulesChanged ? 'As regras da grade mudaram.' : 'As regras da grade são iguais.'
        }}
      </p>
      <p v-if="!comparison.catalogChanges.length">Os cadastros são iguais.</p>
      <ul v-else aria-label="Mudanças nos cadastros">
        <li v-for="(change, index) in comparison.catalogChanges" :key="index">
          {{ kinds[change.kind] }}: {{ change.category }} — {{ change.label }}
        </li>
      </ul>
      <p class="muted">
        Mudanças de horário ou fixação aparecem como remoção e inclusão. Nomes e horários seguem os
        dados de cada revisão. Consulte os dados originais abaixo para conferir cargas,
        disponibilidade e regras.
      </p>
      <div
        v-for="group in [
          { title: 'Alocações removidas', items: comparison.removed },
          { title: 'Alocações incluídas', items: comparison.added },
        ]"
        :key="group.title"
      >
        <h4>{{ group.title }}</h4>
        <p v-if="!group.items.length">Nenhuma.</p>
        <ul v-else :aria-label="group.title">
          <li v-for="(item, index) in group.items" :key="index">
            {{ item.label }} · {{ item.time }}{{ item.pinned ? ' · Fixada' : '' }}
          </li>
        </ul>
      </div>
    </section>
    <template v-if="editable && selected && selected.id !== latest?.id">
      <button v-if="!confirming" :disabled="busy" @click="confirming = true">
        Restaurar revisão {{ selected.number }}
      </button>
      <div v-else class="card" role="group" aria-label="Confirmar restauração">
        <p>
          Restaurar a revisão {{ selected.number }} cria um novo rascunho com seus cadastros, regras
          e grade originais. O rascunho atual fica no histórico e deixa de ser editável. As
          conferências precisarão ser refeitas.
        </p>
        <div class="actions">
          <button :disabled="busy" @click="restore">Confirmar restauração</button
          ><button :disabled="busy" @click="confirming = false">Cancelar restauração</button>
        </div>
      </div>
    </template>
  </section>
</template>
<style scoped>
select,
input {
  width: 100%;
  min-width: 0;
}
li,
p,
h4 {
  overflow-wrap: anywhere;
}
</style>
