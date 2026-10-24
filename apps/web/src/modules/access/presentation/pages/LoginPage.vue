<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { accessApiKey } from '../session-store.ts';
import { injectRequired } from '../../../../shared/presentation/inject-required.ts';
import { errorMessage } from '../../../../shared/presentation/feedback.ts';
const api = injectRequired(accessApiKey);
const router = useRouter();
const username = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);
async function login() {
  error.value = '';
  busy.value = true;
  try {
    await api.login(username.value, password.value);
    password.value = '';
    await router.push('/');
  } catch (cause) {
    error.value = errorMessage(cause);
    password.value = '';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section aria-labelledby="login-title">
    <h1 id="login-title">Entrar no EntreAulas</h1>
    <p>Use o acesso fornecido pela administração.</p>
    <form class="card stack-form" @submit.prevent="login">
      <label for="login-user">Usuário</label
      ><input id="login-user" v-model="username" autocomplete="username" maxlength="40" required />
      <label for="login-password">Senha</label
      ><input
        id="login-password"
        v-model="password"
        type="password"
        autocomplete="current-password"
        maxlength="128"
        required
      />
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button :disabled="busy">{{ busy ? 'Entrando…' : 'Entrar' }}</button>
    </form>
    <p class="muted">
      No primeiro uso, o responsável pela instalação cria o administrador seguindo o guia de
      instalação.
    </p>
  </section>
</template>
