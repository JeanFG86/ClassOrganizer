import { createRouter, createWebHistory } from 'vue-router';
import { httpAccessApi } from './services/access-api.ts';
import HomePage from './pages/HomePage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/entrar',
      name: 'login',
      component: () => import('./pages/LoginPage.vue'),
      meta: { title: 'Entrar' },
    },
    {
      path: '/conta',
      component: () => import('./pages/AccountPage.vue'),
      meta: { title: 'Minha conta' },
    },
    {
      path: '/acessos',
      component: () => import('./pages/UsersPage.vue'),
      meta: { title: 'Acessos', admin: true },
    },
    {
      path: '/planejamentos',
      component: () => import('./pages/PlanningsPage.vue'),
      meta: { title: 'Planejamentos' },
    },
    {
      path: '/auditoria',
      component: () => import('./pages/AuditPage.vue'),
      meta: { title: 'Auditoria', admin: true },
    },
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
      path: '/disponibilidade',
      name: 'availability',
      component: () => import('./pages/AvailabilityPage.vue'),
      meta: { title: 'Disponibilidade' },
    },
    {
      path: '/atribuicoes',
      name: 'assignments',
      component: () => import('./pages/AssignmentsPage.vue'),
      meta: { title: 'Atribuições' },
    },
  ],
});

router.beforeEach(async (to) => {
  if (!httpAccessApi.loaded.value) {
    try {
      await httpAccessApi.load();
    } catch {
      if (to.path !== '/entrar') return '/entrar';
    }
  }
  if (to.path === '/entrar') return httpAccessApi.session.value ? '/' : true;
  if (!httpAccessApi.session.value) return '/entrar';
  if (to.meta['admin'] && httpAccessApi.session.value.user.role !== 'admin') return '/';
  return true;
});
router.afterEach((to) => {
  const title = typeof to.meta['title'] === 'string' ? to.meta['title'] : undefined;
  document.title = title ? `${title} · EntreAulas` : 'EntreAulas';
});
