import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router.ts';
import { assignmentsApiKey, httpAssignmentsApi } from './services/assignments-api.ts';
import { classGroupsApiKey, httpClassGroupsApi } from './services/class-groups-api.ts';
import { httpShiftsApi, shiftsApiKey } from './services/shifts-api.ts';
import { httpSubjectsApi, subjectsApiKey } from './services/subjects-api.ts';
import { httpTeachersApi, teachersApiKey } from './services/teachers-api.ts';
import './styles.css';

createApp(App)
  .use(router)
  .provide(subjectsApiKey, httpSubjectsApi)
  .provide(classGroupsApiKey, httpClassGroupsApi)
  .provide(shiftsApiKey, httpShiftsApi)
  .provide(teachersApiKey, httpTeachersApi)
  .provide(assignmentsApiKey, httpAssignmentsApi)
  .mount('#app');
