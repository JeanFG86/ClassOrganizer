<script setup lang="ts">
import type { SubjectDto } from '@classorganizer/contracts';
import { onMounted, ref } from 'vue';
import { ApiRequestError } from '../services/api-client.ts';
import { injectRequired } from '../services/inject-required.ts';
import { subjectsApiKey } from '../services/subjects-api.ts';

const api = injectRequired(subjectsApiKey);

type LoadState = 'loading' | 'ready' | 'error';

const subjects = ref<SubjectDto[]>([]);
const loadState = ref<LoadState>('loading');
const loadError = ref('');

const name = ref('');
const saving = ref(false);
const formError = ref('');
const savedMessage = ref('');

function messageOf(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : 'Ocorreu um erro inesperado.';
}

async function load(): Promise<void> {
  loadState.value = 'loading';
  try {
    subjects.value = await api.list();
    loadState.value = 'ready';
  } catch (error) {
    loadError.value = messageOf(error);
    loadState.value = 'error';
  }
}

async function submit(): Promise<void> {
  formError.value = '';
  savedMessage.value = '';
  if (name.value.trim() === '') {
    formError.value = 'Informe o nome da disciplina.';
    return;
  }

  saving.value = true;
  try {
    const created = await api.register(name.value);
    savedMessage.value = `Disciplina "${created.name}" cadastrada.`;
    name.value = '';
    await load();
  } catch (error) {
    formError.value = messageOf(error);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section aria-labelledby="subjects-title">
    <h1 id="subjects-title">Disciplinas</h1>

    <form class="card" novalidate @submit.prevent="submit">
      <label for="subject-name">Nome da disciplina</label>
      <div class="row">
        <input
          id="subject-name"
          v-model="name"
          name="name"
          maxlength="80"
          autocomplete="off"
          :aria-invalid="formError !== ''"
          :aria-describedby="formError ? 'subject-form-error' : undefined"
        />
        <button type="submit" :disabled="saving">
          {{ saving ? 'Salvando…' : 'Cadastrar' }}
        </button>
      </div>
      <p v-if="formError" id="subject-form-error" class="error" role="alert">{{ formError }}</p>
      <p v-if="savedMessage" class="success" role="status">{{ savedMessage }}</p>
    </form>

    <h2>Cadastradas</h2>
    <p v-if="loadState === 'loading'" role="status">Carregando disciplinas…</p>
    <div v-else-if="loadState === 'error'" role="alert">
      <p class="error">{{ loadError }}</p>
      <button type="button" @click="load">Tentar novamente</button>
    </div>
    <p v-else-if="subjects.length === 0">Nenhuma disciplina cadastrada ainda.</p>
    <ul v-else class="list" aria-label="Disciplinas cadastradas">
      <li v-for="subject in subjects" :key="subject.id">{{ subject.name }}</li>
    </ul>
  </section>
</template>
