<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { accessApiKey } from '../services/access-api.ts';
import { injectRequired } from '../services/inject-required.ts';
import { errorMessage } from '../services/feedback.ts';
const api = injectRequired(accessApiKey);
const router = useRouter();
const current = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);
async function save() {
  busy.value = true;
  error.value = '';
  try {
    await api.password(current.value, password.value);
    current.value = '';
    password.value = '';
    await router.push('/entrar');
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section aria-labelledby="account-title">
    <h1 id="account-title">Minha conta</h1>
    <p>
      Ao trocar a senha, todas as suas sessões serão encerradas. Entre novamente com a nova senha.
    </p>
    <form class="card stack-form" @submit.prevent="save">
      <label for="current-password">Senha atual</label
      ><input
        id="current-password"
        v-model="current"
        type="password"
        autocomplete="current-password"
        maxlength="128"
        required
      />
      <label for="new-password">Nova senha</label
      ><input
        id="new-password"
        v-model="password"
        type="password"
        autocomplete="new-password"
        minlength="15"
        maxlength="128"
        required
      />
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <button :disabled="busy">Trocar senha</button>
    </form>
  </section>
</template>
