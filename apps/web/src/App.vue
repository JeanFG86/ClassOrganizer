<script setup lang="ts">
import { useRouter } from 'vue-router';
import { ref } from 'vue';
import { accessApiKey, roleLabels } from './modules/access/presentation/session-store.ts';
import { injectRequired } from './shared/presentation/inject-required.ts';
import { errorMessage } from './shared/presentation/feedback.ts';
const api = injectRequired(accessApiKey);
const router = useRouter();
const logoutError = ref('');
async function logout() {
  logoutError.value = '';
  try {
    await api.logout();
    await router.push('/entrar');
  } catch (error) {
    logoutError.value = errorMessage(error);
  }
}
</script>
<template>
  <a class="skip-link" href="#main">Ir para o conteúdo</a>
  <header class="topbar">
    <RouterLink to="/" class="brand">EntreAulas</RouterLink>
    <nav v-if="api.session.value" aria-label="Principal">
      <RouterLink to="/">Início</RouterLink>
      <RouterLink to="/disciplinas">Disciplinas</RouterLink>
      <RouterLink to="/turmas">Turmas</RouterLink>
      <RouterLink to="/turnos">Turnos</RouterLink>
      <RouterLink to="/recursos">Recursos</RouterLink>
      <RouterLink to="/professores">Professores</RouterLink>
      <RouterLink to="/disponibilidade">Disponibilidade</RouterLink>
      <RouterLink to="/atribuicoes">Atribuições</RouterLink>
      <RouterLink to="/planejamentos">Planejamentos</RouterLink>
      <RouterLink v-if="api.session.value.user.role === 'admin'" to="/acessos">Acessos</RouterLink>
      <RouterLink v-if="api.session.value.user.role === 'admin'" to="/auditoria"
        >Auditoria</RouterLink
      >
      <RouterLink to="/conta">Minha conta</RouterLink>
    </nav>
    <div v-if="api.session.value" class="session-info">
      <span
        >{{ api.session.value.user.username }} · {{ roleLabels[api.session.value.user.role] }}</span
      ><button class="small ghost" @click="logout">Sair</button>
    </div>
  </header>
  <main id="main" tabindex="-1">
    <p v-if="logoutError" class="error" role="alert">{{ logoutError }}</p>
    <p v-if="api.session.value?.user.role === 'viewer'" class="muted" role="status">
      Seu perfil permite apenas consulta e download das revisões.
    </p>
    <RouterView :key="$route.path" />
  </main>
</template>
