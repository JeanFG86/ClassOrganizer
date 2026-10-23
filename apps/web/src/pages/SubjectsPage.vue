<script setup lang="ts">
import CatalogPage, { type CatalogTexts } from '../components/CatalogPage.vue';
import { injectRequired } from '../services/inject-required.ts';
import { subjectsApiKey } from '../services/subjects-api.ts';

const api = injectRequired(subjectsApiKey);

const texts: CatalogTexts = {
  title: 'Disciplinas',
  noun: 'Disciplina',
  fieldLabel: 'Nome da disciplina',
  idPrefix: 'subject',
  maxLength: 80,
  archivedHint:
    'Não aparecem nas opções de habilitação nem de atribuição; professores já habilitados continuam com elas.',
};
</script>

<template>
  <CatalogPage :api="api" :texts="texts" />
</template>
