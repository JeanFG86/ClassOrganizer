<script setup lang="ts">
import { useAccess } from '../../../access/index.ts';
const { canWrite } = useAccess();
import CatalogPage, {
  type CatalogTexts,
} from '../../../../shared/presentation/components/CatalogPage.vue';
import { injectRequired } from '../../../../shared/presentation/inject-required.ts';
import { subjectsApiKey } from '../subjects-key.ts';

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
  <CatalogPage :can-write="canWrite" :api="api" :texts="texts" />
</template>
