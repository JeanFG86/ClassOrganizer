import { createRouter, createWebHistory, type RouterHistory } from 'vue-router';
import type { SessionStore } from '../modules/access/presentation/session-store.ts';
import HomePage from './HomePage.vue';

export function createAppRouter(
  session: SessionStore,
  history: RouterHistory = createWebHistory(),
) {
  const router = createRouter({
    history,
    routes: [
      {
        path: '/entrar',
        name: 'login',
        component: () => import('../modules/access/presentation/pages/LoginPage.vue'),
        meta: { title: 'Entrar' },
      },
      {
        path: '/conta',
        component: () => import('../modules/access/presentation/pages/AccountPage.vue'),
        meta: { title: 'Minha conta' },
      },
      {
        path: '/acessos',
        component: () => import('../modules/access/presentation/pages/UsersPage.vue'),
        meta: { title: 'Acessos', admin: true },
      },
      {
        path: '/planejamentos',
        component: () => import('../modules/planning/presentation/pages/PlanningsPage.vue'),
        meta: { title: 'Planejamentos' },
      },
      {
        path: '/planejamentos/:id/grade',
        component: () => import('../modules/planning/presentation/pages/GridPage.vue'),
        meta: { title: 'Grade' },
      },
      {
        path: '/planejamentos/:id/impressoes',
        component: () => import('../modules/planning/presentation/pages/TimetableReportPage.vue'),
        meta: { title: 'Impressão e exportação', report: true },
      },
      {
        path: '/planejamentos/:id/geracao',
        component: () => import('../modules/generation/presentation/pages/GenerationPage.vue'),
        meta: { title: 'Geração automática' },
      },
      {
        path: '/auditoria',
        component: () => import('../modules/access/presentation/pages/AuditPage.vue'),
        meta: { title: 'Auditoria', admin: true },
      },
      { path: '/', name: 'home', component: HomePage, meta: { title: 'Início' } },
      {
        path: '/disciplinas',
        name: 'subjects',
        component: () => import('../modules/school-structure/presentation/pages/SubjectsPage.vue'),
        meta: { title: 'Disciplinas' },
      },
      {
        path: '/turmas',
        name: 'class-groups',
        component: () =>
          import('../modules/school-structure/presentation/pages/ClassGroupsPage.vue'),
        meta: { title: 'Turmas' },
      },
      {
        path: '/turnos',
        name: 'shifts',
        component: () => import('../modules/school-structure/presentation/pages/ShiftsPage.vue'),
        meta: { title: 'Turnos e horários' },
      },
      {
        path: '/recursos',
        name: 'resources',
        component: () => import('../modules/school-structure/presentation/pages/ResourcesPage.vue'),
        meta: { title: 'Recursos especiais' },
      },
      {
        path: '/professores',
        name: 'teachers',
        component: () => import('../modules/teaching/presentation/pages/TeachersPage.vue'),
        meta: { title: 'Professores' },
      },
      {
        path: '/disponibilidade',
        name: 'availability',
        component: () => import('../modules/teaching/presentation/pages/AvailabilityPage.vue'),
        meta: { title: 'Disponibilidade' },
      },
      {
        path: '/atribuicoes',
        name: 'assignments',
        component: () => import('../modules/teaching/presentation/pages/AssignmentsPage.vue'),
        meta: { title: 'Atribuições' },
      },
    ],
  });

  router.beforeEach(async (to) => {
    if (!session.loaded.value) {
      try {
        await session.load();
      } catch {
        if (to.path !== '/entrar') return '/entrar';
      }
    }
    if (to.path === '/entrar') return session.session.value ? '/' : true;
    if (!session.session.value) return '/entrar';
    if (to.meta['admin'] && session.session.value.user.role !== 'admin') return '/';
    return true;
  });
  router.afterEach((to) => {
    const title = typeof to.meta['title'] === 'string' ? to.meta['title'] : undefined;
    document.title = title ? `${title} · EntreAulas` : 'EntreAulas';
  });

  return router;
}
