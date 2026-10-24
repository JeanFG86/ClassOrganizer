<script setup lang="ts" generic="T extends CatalogItem">
import { useAccess } from '../services/access-api.ts';
import { computed, nextTick, onMounted, ref } from 'vue';
import type { CatalogApi, CatalogItem } from '../services/catalog-api.ts';
import { errorMessage, isOutdatedError, type Feedback } from '../services/feedback.ts';

/**
 * Textos de um cadastro simples por nome. As mensagens concordam com o gênero do substantivo:
 * "cadastrada" (disciplina, turma) ou, com `masculine`, "cadastrado" (recurso).
 */
export interface CatalogTexts {
  /** Título da página e prefixo dos rótulos das listas (ex.: "Disciplinas"). */
  title: string;
  /** Substantivo singular, com inicial maiúscula (ex.: "Disciplina"). */
  noun: string;
  /** Rótulo do campo de nome (ex.: "Nome da disciplina"). */
  fieldLabel: string;
  /** Prefixo dos ids de elementos (ex.: "subject"). */
  idPrefix: string;
  maxLength: number;
  /** Explicação sobre o efeito do arquivamento. */
  archivedHint: string;
  /** Orientação exibida logo abaixo do título. */
  intro?: string;
  /** Substantivo masculino; ausente, as mensagens ficam no feminino. */
  masculine?: boolean;
}

const { canWrite } = useAccess();
const props = defineProps<{
  api: CatalogApi<T>;
  texts: CatalogTexts;
  /** Informação complementar exibida ao lado do nome de cada item ativo. */
  detail?: (item: T) => string | undefined;
}>();

type LoadState = 'loading' | 'ready' | 'error';

const items = ref<T[]>([]) as { value: T[] };
const loadState = ref<LoadState>('loading');
const loadError = ref('');
const activeItems = computed(() => items.value.filter((i) => i.archivedAt === null));
const archivedItems = computed(() => items.value.filter((i) => i.archivedAt !== null));

const plural = computed(() => props.texts.title.toLocaleLowerCase('pt-BR'));
/** Terminação de "cadastrada"/"cadastrado" e similares. */
const ending = computed(() => (props.texts.masculine ? 'o' : 'a'));
const singular = computed(() => props.texts.noun.toLocaleLowerCase('pt-BR'));
const ids = computed(() => ({
  name: `${props.texts.idPrefix}-name`,
  formError: `${props.texts.idPrefix}-form-error`,
  archivedTitle: `archived-${props.texts.idPrefix}s-title`,
}));

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
    items.value = await props.api.list();
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
    formFeedback.value = {
      kind: 'error',
      text: `Informe o nome d${ending.value} ${singular.value}.`,
    };
    return;
  }

  saving.value = true;
  try {
    const created = await props.api.register(name.value);
    formFeedback.value = {
      kind: 'success',
      text: `${props.texts.noun} "${created.name}" cadastrad${ending.value}.`,
    };
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

async function startEdit(item: T): Promise<void> {
  clearFeedback();
  editingId.value = item.id;
  editingName.value = item.name;
  await nextTick();
  document.getElementById(`edit-${item.id}`)?.focus();
}

function cancelEdit(): void {
  editingId.value = null;
}

function saveEdit(item: T): Promise<void> {
  return runListAction(async () => {
    const updated = await props.api.update(item.id, {
      name: editingName.value,
      version: item.version,
    });
    return `${props.texts.noun} renomead${ending.value} para "${updated.name}".`;
  });
}

function archive(item: T): Promise<void> {
  return runListAction(async () => {
    await props.api.archive(item.id, item.version);
    return `${props.texts.noun} "${item.name}" arquivad${ending.value}.`;
  });
}

function restore(item: T): Promise<void> {
  return runListAction(async () => {
    await props.api.restore(item.id, item.version);
    return `${props.texts.noun} "${item.name}" restaurad${ending.value}.`;
  });
}

onMounted(load);
</script>

<template>
  <section :aria-labelledby="`${texts.idPrefix}-page-title`">
    <h1 :id="`${texts.idPrefix}-page-title`">{{ texts.title }}</h1>
    <p v-if="texts.intro" class="hint">{{ texts.intro }}</p>

    <form v-if="canWrite" class="card" novalidate @submit.prevent="submit">
      <label :for="ids.name">{{ texts.fieldLabel }}</label>
      <div class="row">
        <input
          :id="ids.name"
          v-model="name"
          name="name"
          :maxlength="texts.maxLength"
          autocomplete="off"
          :aria-invalid="formFeedback?.kind === 'error'"
          :aria-describedby="formFeedback?.kind === 'error' ? ids.formError : undefined"
        />
        <button type="submit" :disabled="saving || !canWrite">
          {{ saving ? 'Salvando…' : 'Cadastrar' }}
        </button>
      </div>
      <p v-if="formFeedback?.kind === 'error'" :id="ids.formError" class="error" role="alert">
        {{ formFeedback.text }}
      </p>
      <p v-if="formFeedback?.kind === 'success'" class="success" role="status">
        {{ formFeedback.text }}
      </p>
    </form>

    <h2>Cadastrad{{ ending }}s</h2>
    <p v-if="listFeedback?.kind === 'error'" class="error" role="alert">{{ listFeedback.text }}</p>
    <p v-if="listFeedback?.kind === 'success'" class="success" role="status">
      {{ listFeedback.text }}
    </p>

    <p v-if="loadState === 'loading'" role="status">Carregando {{ plural }}…</p>
    <div v-else-if="loadState === 'error'" role="alert">
      <p class="error">{{ loadError }}</p>
      <button type="button" @click="load">Tentar novamente</button>
    </div>
    <template v-else>
      <p v-if="activeItems.length === 0">
        {{ texts.masculine ? 'Nenhum' : 'Nenhuma' }} {{ singular }} cadastrad{{ ending }} ainda.
      </p>
      <ul v-else class="list" :aria-label="`${texts.title} cadastrad${ending}s`">
        <li v-for="item in activeItems" :key="item.id" class="item">
          <form
            v-if="editingId === item.id"
            class="inline-edit"
            novalidate
            @submit.prevent="saveEdit(item)"
            @keydown.esc="cancelEdit"
          >
            <label :for="`edit-${item.id}`" class="visually-hidden">
              Novo nome para {{ item.name }}
            </label>
            <input
              :id="`edit-${item.id}`"
              v-model="editingName"
              :maxlength="texts.maxLength"
              autocomplete="off"
            />
            <button type="submit" class="small" :disabled="busy || !canWrite">Salvar</button>
            <button type="button" class="small ghost" @click="cancelEdit">Cancelar</button>
          </form>
          <template v-else>
            <span class="item-name">{{ item.name }}</span>
            <span v-if="detail?.(item)" class="item-detail muted">{{ detail(item) }}</span>
            <span v-if="canWrite" class="item-actions">
              <button
                type="button"
                class="small ghost"
                :aria-label="`Editar ${item.name}`"
                :disabled="busy || !canWrite"
                @click="startEdit(item)"
              >
                Editar
              </button>
              <button
                type="button"
                class="small ghost"
                :aria-label="`Arquivar ${item.name}`"
                :disabled="busy || !canWrite"
                @click="archive(item)"
              >
                Arquivar
              </button>
            </span>
          </template>
        </li>
      </ul>

      <section v-if="archivedItems.length > 0" :aria-labelledby="ids.archivedTitle">
        <h2 :id="ids.archivedTitle">Arquivad{{ ending }}s ({{ archivedItems.length }})</h2>
        <p class="muted">{{ texts.archivedHint }}</p>
        <ul class="list" :aria-label="`${texts.title} arquivad${ending}s`">
          <li v-for="item in archivedItems" :key="item.id" class="item">
            <span class="item-name muted">{{ item.name }}</span>
            <span class="item-actions">
              <button
                type="button"
                class="small ghost"
                :aria-label="`Restaurar ${item.name}`"
                :disabled="busy || !canWrite"
                @click="restore(item)"
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
