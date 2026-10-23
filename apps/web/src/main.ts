import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router.ts';
import { httpSubjectsApi, subjectsApiKey } from './services/subjects-api.ts';
import { httpTeachersApi, teachersApiKey } from './services/teachers-api.ts';
import './styles.css';

createApp(App)
  .use(router)
  .provide(subjectsApiKey, httpSubjectsApi)
  .provide(teachersApiKey, httpTeachersApi)
  .mount('#app');
