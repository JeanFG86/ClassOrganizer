<script setup lang="ts">
import type { SubjectDto, TeacherDto } from '@classorganizer/contracts';
import { computed, onMounted, ref } from 'vue';
import { ApiRequestError } from '../services/api-client.ts';
import { injectRequired } from '../services/inject-required.ts';
import { subjectsApiKey } from '../services/subjects-api.ts';
import { teachersApiKey } from '../services/teachers-api.ts';

const subjectsApi = injectRequired(subjectsApiKey);
const teachersApi = injectRequired(teachersApiKey);

type LoadState = 'loading' | 'ready' | 'error';

const subjects = ref<SubjectDto[]>([]);
const teachers = ref<TeacherDto[]>([]);
const loadState = ref<LoadState>('loading');
const loadError = ref('');

const name = ref('');
const selectedSubjectIds = ref<string[]>([]);
const saving = ref(false);
const formError = ref('');
const savedMessage = ref('');

const subjectNameById = computed(() => new Map(subjects.value.map((s) => [s.id, s.name])));

function subjectNames(teacher: TeacherDto): string {
  const names = teacher.subjectIds.map((id) => subjectNameById.value.get(id) ?? '(removida)');
  return names.length > 0 ? names.join(', ') : 'Sem habilitações';
}

function messageOf(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : 'Ocorreu um erro inesperado.';
}

async function load(): Promise<void> {
  loadState.value = 'loading';
  await refresh();
}

/** Atualiza as listas sem voltar ao estado "carregando". */
async function refresh(): Promise<void> {
  try {
    const [subjectList, teacherList] = await Promise.all([subjectsApi.list(), teachersApi.list()]);
    subjects.value = subjectList;
    teachers.value = teacherList;
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
    formError.value = 'Informe o nome do professor.';
    return;
  }

  saving.value = true;
  try {
    const created = await teachersApi.register({
      name: name.value,
      subjectIds: selectedSubjectIds.value,
    });
    savedMessage.value = `Professor(a) "${created.name}" cadastrado(a).`;
    name.value = '';
    selectedSubjectIds.value = [];
    await refresh();
  } catch (error) {
    formError.value = messageOf(error);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section aria-labelledby="teachers-title">
    <h1 id="teachers-title">Professores</h1>

    <p v-if="loadState === 'loading'" role="status">Carregando professores…</p>
    <div v-else-if="loadState === 'error'" role="alert">
      <p class="error">{{ loadError }}</p>
      <button type="button" @click="load">Tentar novamente</button>
    </div>

    <template v-else>
      <form class="card" novalidate @submit.prevent="submit">
        <label for="teacher-name">Nome do professor</label>
        <input
          id="teacher-name"
          v-model="name"
          name="name"
          maxlength="120"
          autocomplete="off"
          :aria-invalid="formError !== ''"
          :aria-describedby="formError ? 'teacher-form-error' : undefined"
        />

        <fieldset class="checks">
          <legend>Disciplinas que pode lecionar</legend>
          <p v-if="subjects.length === 0" class="hint">
            Nenhuma disciplina cadastrada.
            <RouterLink to="/disciplinas">Cadastre as disciplinas</RouterLink> para habilitar
            professores.
          </p>
          <label v-for="subject in subjects" :key="subject.id" class="check">
            <input v-model="selectedSubjectIds" type="checkbox" :value="subject.id" />
            {{ subject.name }}
          </label>
        </fieldset>

        <button type="submit" :disabled="saving">
          {{ saving ? 'Salvando…' : 'Cadastrar professor' }}
        </button>
        <p v-if="formError" id="teacher-form-error" class="error" role="alert">{{ formError }}</p>
        <p v-if="savedMessage" class="success" role="status">{{ savedMessage }}</p>
      </form>

      <h2>Cadastrados</h2>
      <p v-if="teachers.length === 0">Nenhum professor cadastrado ainda.</p>
      <ul v-else class="list" aria-label="Professores cadastrados">
        <li v-for="teacher in teachers" :key="teacher.id">
          <strong>{{ teacher.name }}</strong>
          <span class="muted"> — {{ subjectNames(teacher) }}</span>
        </li>
      </ul>
    </template>
  </section>
</template>
