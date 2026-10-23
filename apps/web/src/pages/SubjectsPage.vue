<script setup lang="ts">
import type { SubjectDto } from '@classorganizer/contracts';
import { computed, nextTick, onMounted, ref } from 'vue';
import { errorMessage, isOutdatedError, type Feedback } from '../services/feedback.ts';
import { injectRequired } from '../services/inject-required.ts';
import { subjectsApiKey } from '../services/subjects-api.ts';

const api = injectRequired(subjectsApiKey);

type LoadState = 'loading' | 'ready' | 'error';

const subjects = ref<SubjectDto[]>([]);
const loadState = ref<LoadState>('loading');
const loadError = ref('');
const activeSubjects = computed(() => subjects.value.filter((s) => s.archivedAt === null));
const archivedSubjects = computed(() => subjects.value.filter((s) => s.archivedAt !== null));

const name = ref('');
const saving = ref(false);
const formFeedback = ref<Feedback | null>(null);

const listFeedback = ref<Feedback | null>(null);
const busy = ref(false);
const editingId = ref<string | null>(null);
const editingName = ref('');

async function load(): Promise<void> {
  loadState.value = 'loading';
  await refresh();
}

/** Atualiza a lista sem voltar ao estado "carregando", preservando o que já está na tela. */
async function refresh(): Promise<void> {
  try {
    subjects.value = await api.list();
    loadState.value = 'ready';
  } catch (error) {
    loadError.value = errorMessage(error);
    loadState.value = 'error';
  }
}

function clearFeedback(): void {
  formFeedback.value = null;
  listFeedback.value = null;
}

async function submit(): Promise<void> {
  clearFeedback();
  if (name.value.trim() === '') {
    formFeedback.value = { kind: 'error', text: 'Informe o nome da disciplina.' };
    return;
  }

  saving.value = true;
  try {
    const created = await api.register(name.value);
    formFeedback.value = { kind: 'success', text: `Disciplina "${created.name}" cadastrada.` };
    name.value = '';
    await refresh();
  } catch (error) {
    formFeedback.value = { kind: 'error', text: errorMessage(error) };
  } finally {
    saving.value = false;
  }
}

/** Executa uma ação da lista e mostra o resultado; dados desatualizados são recarregados. */
async function runListAction(action: () => Promise<string>): Promise<void> {
  clearFeedback();
  busy.value = true;
  try {
    listFeedback.value = { kind: 'success', text: await action() };
    editingId.value = null;
    await refresh();
  } catch (error) {
    listFeedback.value = { kind: 'error', text: errorMessage(error) };
    if (isOutdatedError(error)) {
      editingId.value = null;
      await refresh();
    }
  } finally {
    busy.value = false;
  }
}

async function startEdit(subject: SubjectDto): Promise<void> {
  clearFeedback();
  editingId.value = subject.id;
  editingName.value = subject.name;
  await nextTick();
  document.getElementById(`edit-${subject.id}`)?.focus();
}

function cancelEdit(): void {
  editingId.value = null;
}

function saveEdit(subject: SubjectDto): Promise<void> {
  return runListAction(async () => {
    const updated = await api.update(subject.id, {
      name: editingName.value,
      version: subject.version,
    });
    return `Disciplina renomeada para "${updated.name}".`;
  });
}

function archive(subject: SubjectDto): Promise<void> {
  return runListAction(async () => {
    await api.archive(subject.id, subject.version);
    return `Disciplina "${subject.name}" arquivada.`;
  });
}

function restore(subject: SubjectDto): Promise<void> {
  return runListAction(async () => {
    await api.restore(subject.id, subject.version);
    return `Disciplina "${subject.name}" restaurada.`;
  });
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
          :aria-invalid="formFeedback?.kind === 'error'"
          :aria-describedby="formFeedback?.kind === 'error' ? 'subject-form-error' : undefined"
        />
        <button type="submit" :disabled="saving">
          {{ saving ? 'Salvando…' : 'Cadastrar' }}
        </button>
      </div>
      <p v-if="formFeedback?.kind === 'error'" id="subject-form-error" class="error" role="alert">
        {{ formFeedback.text }}
      </p>
      <p v-if="formFeedback?.kind === 'success'" class="success" role="status">
        {{ formFeedback.text }}
      </p>
    </form>

    <h2>Cadastradas</h2>
    <p v-if="listFeedback?.kind === 'error'" class="error" role="alert">{{ listFeedback.text }}</p>
    <p v-if="listFeedback?.kind === 'success'" class="success" role="status">
      {{ listFeedback.text }}
    </p>

    <p v-if="loadState === 'loading'" role="status">Carregando disciplinas…</p>
    <div v-else-if="loadState === 'error'" role="alert">
      <p class="error">{{ loadError }}</p>
      <button type="button" @click="load">Tentar novamente</button>
    </div>
    <template v-else>
      <p v-if="activeSubjects.length === 0">Nenhuma disciplina cadastrada ainda.</p>
      <ul v-else class="list" aria-label="Disciplinas cadastradas">
        <li v-for="subject in activeSubjects" :key="subject.id" class="item">
          <form
            v-if="editingId === subject.id"
            class="inline-edit"
            novalidate
            @submit.prevent="saveEdit(subject)"
            @keydown.esc="cancelEdit"
          >
            <label :for="`edit-${subject.id}`" class="visually-hidden">
              Novo nome para {{ subject.name }}
            </label>
            <input
              :id="`edit-${subject.id}`"
              v-model="editingName"
              maxlength="80"
              autocomplete="off"
            />
            <button type="submit" class="small" :disabled="busy">Salvar</button>
            <button type="button" class="small ghost" @click="cancelEdit">Cancelar</button>
          </form>
          <template v-else>
            <span class="item-name">{{ subject.name }}</span>
            <span class="item-actions">
              <button
                type="button"
                class="small ghost"
                :aria-label="`Editar ${subject.name}`"
                :disabled="busy"
                @click="startEdit(subject)"
              >
                Editar
              </button>
              <button
                type="button"
                class="small ghost"
                :aria-label="`Arquivar ${subject.name}`"
                :disabled="busy"
                @click="archive(subject)"
              >
                Arquivar
              </button>
            </span>
          </template>
        </li>
      </ul>

      <section v-if="archivedSubjects.length > 0" aria-labelledby="archived-subjects-title">
        <h2 id="archived-subjects-title">Arquivadas ({{ archivedSubjects.length }})</h2>
        <p class="muted">
          Não aparecem nas opções de habilitação; professores já habilitados continuam com elas.
        </p>
        <ul class="list" aria-label="Disciplinas arquivadas">
          <li v-for="subject in archivedSubjects" :key="subject.id" class="item">
            <span class="item-name muted">{{ subject.name }}</span>
            <span class="item-actions">
              <button
                type="button"
                class="small ghost"
                :aria-label="`Restaurar ${subject.name}`"
                :disabled="busy"
                @click="restore(subject)"
              >
                Restaurar
              </button>
            </span>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>
