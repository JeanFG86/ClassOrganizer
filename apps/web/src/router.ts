import { createRouter, createWebHistory } from 'vue-router';
import HomePage from './pages/HomePage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage, meta: { title: 'Início' } },
    {
      path: '/disciplinas',
      name: 'subjects',
      component: () => import('./pages/SubjectsPage.vue'),
      meta: { title: 'Disciplinas' },
    },
    {
      path: '/turmas',
      name: 'class-groups',
      component: () => import('./pages/ClassGroupsPage.vue'),
      meta: { title: 'Turmas' },
    },
    {
      path: '/turnos',
      name: 'shifts',
      component: () => import('./pages/ShiftsPage.vue'),
      meta: { title: 'Turnos e horários' },
    },
    {
      path: '/professores',
      name: 'teachers',
      component: () => import('./pages/TeachersPage.vue'),
      meta: { title: 'Professores' },
    },
    {
      path: '/atribuicoes',
      name: 'assignments',
      component: () => import('./pages/AssignmentsPage.vue'),
      meta: { title: 'Atribuições' },
    },
  ],
});

router.afterEach((to) => {
  const title = typeof to.meta['title'] === 'string' ? to.meta['title'] : undefined;
  document.title = title ? `${title} · EntreAulas` : 'EntreAulas';
});
