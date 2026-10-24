<script setup lang="ts">
import { accountsApiKey } from '../accounts-key.ts';
import { onMounted, ref } from 'vue';
import type { UserAccountDto } from '@classorganizer/contracts';
import { roleLabels } from '../session-store.ts';
import { injectRequired } from '../../../../shared/presentation/inject-required.ts';
import { errorMessage } from '../../../../shared/presentation/feedback.ts';
const api = injectRequired(accountsApiKey);
const users = ref<UserAccountDto[]>([]);
const username = ref('');
const password = ref('');
const role = ref<UserAccountDto['role']>('viewer');
const editing = ref<UserAccountDto | null>(null);
const editRole = ref<UserAccountDto['role']>('viewer');
const disabled = ref(false);
const resetPassword = ref('');
const loading = ref(true);
const loadError = ref('');
const error = ref('');
const status = ref('');
const busy = ref(false);
async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    users.value = await api.users();
  } catch (cause) {
    loadError.value = errorMessage(cause);
  } finally {
    loading.value = false;
  }
}
async function run(action: () => Promise<unknown>, message: string) {
  busy.value = true;
  error.value = '';
  status.value = '';
  try {
    await action();
    status.value = message;
    editing.value = null;
    resetPassword.value = '';
    password.value = '';
    await load();
  } catch (cause) {
    error.value = errorMessage(cause);
    await load();
  } finally {
    busy.value = false;
  }
}
function edit(user: UserAccountDto) {
  editing.value = user;
  editRole.value = user.role;
  disabled.value = user.disabled;
  resetPassword.value = '';
}
function saveEdit() {
  const user = editing.value;
  if (user)
    return run(
      () => api.changeUser(user, editRole.value, disabled.value, resetPassword.value || undefined),
      'Acesso atualizado. As sessões anteriores desse usuário foram encerradas.',
    );
}
onMounted(load);
</script>
<template>
  <section aria-labelledby="users-title">
    <h1 id="users-title">Acessos</h1>
    <p>
      Administradores gerenciam acessos e arquivam planejamentos. Editores preparam os dados e
      revisões. Consulta permite ler e baixar revisões.
    </p>
    <form
      class="card stack-form"
      @submit.prevent="run(() => api.createUser(username, password, role), 'Acesso criado.')"
    >
      <h2>Criar acesso</h2>
      <label for="user-name">Usuário do novo acesso</label
      ><input
        id="user-name"
        v-model="username"
        autocomplete="off"
        minlength="4"
        maxlength="40"
        required
      />
      <label for="user-password">Senha inicial</label
      ><input
        id="user-password"
        v-model="password"
        type="password"
        autocomplete="new-password"
        minlength="15"
        maxlength="128"
        required
      />
      <label for="user-role">Perfil do novo acesso</label
      ><select id="user-role" v-model="role">
        <option v-for="(label, value) in roleLabels" :key="value" :value="value">
          {{ label }}
        </option>
      </select>
      <button :disabled="busy">Criar acesso</button>
    </form>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="status" role="status">{{ status }}</p>
    <p v-if="loading" role="status">Carregando acessos…</p>
    <div v-else-if="loadError" role="alert">
      <p>{{ loadError }}</p>
      <button @click="load">Tentar novamente</button>
    </div>
    <ul v-else class="list" aria-label="Acessos cadastrados">
      <li v-for="user in users" :key="user.id" class="item">
        <span
          >{{ user.username }} · {{ roleLabels[user.role] }} ·
          {{ user.disabled ? 'Desativado' : 'Ativo' }}</span
        ><button
          :aria-label="'Editar acesso ' + user.username"
          :disabled="busy"
          @click="edit(user)"
        >
          Editar
        </button>
      </li>
    </ul>
    <form
      v-if="editing"
      class="card stack-form"
      @submit.prevent="saveEdit"
      @keydown.esc="editing = null"
    >
      <h2>Editar acesso {{ editing.username }}</h2>
      <label for="edit-role">Perfil</label
      ><select id="edit-role" v-model="editRole">
        <option v-for="(label, value) in roleLabels" :key="value" :value="value">
          {{ label }}
        </option>
      </select>
      <label><input v-model="disabled" type="checkbox" /> Desativar acesso</label>
      <label for="reset-password">Nova senha (opcional)</label
      ><input
        id="reset-password"
        v-model="resetPassword"
        type="password"
        autocomplete="new-password"
        minlength="15"
        maxlength="128"
      />
      <div class="actions">
        <button :disabled="busy">Salvar acesso</button
        ><button type="button" @click="editing = null">Cancelar</button>
      </div>
    </form>
  </section>
</template>
