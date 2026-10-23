<script setup lang="ts">
import CatalogPage, { type CatalogTexts } from '../components/CatalogPage.vue';
import { classGroupsApiKey } from '../services/class-groups-api.ts';
import { injectRequired } from '../services/inject-required.ts';

const api = injectRequired(classGroupsApiKey);

const texts: CatalogTexts = {
  title: 'Turmas',
  noun: 'Turma',
  fieldLabel: 'Nome da turma',
  idPrefix: 'class-group',
  maxLength: 40,
  archivedHint:
    'Não aparecem nas opções de atribuição; as atribuições já feitas continuam registradas.',
};
</script>

<template>
  <CatalogPage :api="api" :texts="texts" />
</template>
