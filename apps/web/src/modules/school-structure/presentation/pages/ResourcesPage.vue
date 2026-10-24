<script setup lang="ts">
import { useAccess } from '../../../access/index.ts';
const { canWrite } = useAccess();
import CatalogPage, {
  type CatalogTexts,
} from '../../../../shared/presentation/components/CatalogPage.vue';
import { injectRequired } from '../../../../shared/presentation/inject-required.ts';
import { resourcesApiKey } from '../resources-key.ts';

const api = injectRequired(resourcesApiKey);

const texts: CatalogTexts = {
  title: 'Recursos especiais',
  noun: 'Recurso',
  fieldLabel: 'Nome do recurso',
  idPrefix: 'resource',
  maxLength: 60,
  masculine: true,
  intro:
    'Cadastre só os espaços ou equipamentos que atendem uma turma por vez, como a quadra ou um laboratório. Depois, marque nas atribuições os blocos que usam cada recurso: a grade não deixa dois desses blocos no mesmo horário. Sem recursos cadastrados, nada muda.',
  archivedHint:
    'Não aparecem nas opções das atribuições e deixam de reservar horários nas próximas revisões; os blocos que já os usam continuam marcados.',
};
</script>

<template>
  <CatalogPage :can-write="canWrite" :api="api" :texts="texts" />
</template>
