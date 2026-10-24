import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router.ts';
import { assignmentsApiKey, httpAssignmentsApi } from './services/assignments-api.ts';
import { classGroupsApiKey, httpClassGroupsApi } from './services/class-groups-api.ts';
import { httpShiftsApi, shiftsApiKey } from './services/shifts-api.ts';
import { httpSubjectsApi, subjectsApiKey } from './services/subjects-api.ts';
import { httpTeachersApi, teachersApiKey } from './services/teachers-api.ts';
import { accessApiKey, httpAccessApi } from './services/access-api.ts';
import { gridApiKey, httpGridApi } from './services/grid-api.ts';
import { generationApiKey, httpGenerationApi } from './services/generation-api.ts';
import './styles.css';
window.addEventListener('session-expired', () => {
  httpAccessApi.session.value = null;
  void router.push('/entrar');
});

createApp(App)
  .use(router)
  .provide(accessApiKey, httpAccessApi)
  .provide(subjectsApiKey, httpSubjectsApi)
  .provide(classGroupsApiKey, httpClassGroupsApi)
  .provide(shiftsApiKey, httpShiftsApi)
  .provide(teachersApiKey, httpTeachersApi)
  .provide(assignmentsApiKey, httpAssignmentsApi)
  .provide(gridApiKey, httpGridApi)
  .provide(generationApiKey, httpGenerationApi)
  .mount('#app');
