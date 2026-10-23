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
  ],
});

router.afterEach((to) => {
  const title = typeof to.meta['title'] === 'string' ? to.meta['title'] : undefined;
  document.title = title ? `${title} · EntreAulas` : 'EntreAulas';
});
