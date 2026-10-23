<template>
  <section aria-labelledby="home-title">
    <h1 id="home-title">Organizador de aulas</h1>
    <p>Prepare os dados da escola para montar a grade semanal, nesta ordem:</p>
    <ol class="steps">
      <li>
        <RouterLink to="/disciplinas">Disciplinas</RouterLink> e
        <RouterLink to="/turmas">turmas</RouterLink> da escola;
      </li>
      <li>
        <RouterLink to="/turnos">Turnos e horários</RouterLink>: o horário de cada aula e as aulas
        que cada turma tem;
      </li>
      <li>
        <RouterLink to="/professores">Professores</RouterLink>, com as disciplinas que cada um pode
        lecionar, a carga máxima e a hora-atividade, e a
        <RouterLink to="/disponibilidade">disponibilidade</RouterLink> de cada um;
      </li>
      <li>
        <RouterLink to="/atribuicoes">Atribuições</RouterLink>: quem dá cada disciplina em cada
        turma e quantas aulas por semana.
      </li>
    </ol>
    <p class="actions">
      <RouterLink class="button" to="/disciplinas">Começar pelas disciplinas</RouterLink>
      <RouterLink class="button secondary" to="/atribuicoes">Ir para atribuições</RouterLink>
    </p>
  </section>
</template>
