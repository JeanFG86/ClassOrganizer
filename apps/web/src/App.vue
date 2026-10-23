<template>
  <a class="skip-link" href="#main">Ir para o conteúdo</a>
  <header class="topbar">
    <RouterLink to="/" class="brand">EntreAulas</RouterLink>
    <nav aria-label="Principal">
      <RouterLink to="/">Início</RouterLink>
      <RouterLink to="/disciplinas">Disciplinas</RouterLink>
    </nav>
  </header>
  <main id="main" tabindex="-1">
    <RouterView />
  </main>
</template>
