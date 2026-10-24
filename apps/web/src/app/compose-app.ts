import { createApp } from 'vue';
import App from '../App.vue';
import { createAppRouter } from './router.ts';
import { assignmentsApiKey } from '../modules/teaching/presentation/assignments-key.ts';
import { createAssignmentsApi } from '../modules/teaching/infra/assignments-http-api.ts';
import { classGroupsApiKey } from '../modules/school-structure/presentation/class-groups-key.ts';
import { createClassGroupsApi } from '../modules/school-structure/infra/class-groups-http-api.ts';
import { createResourcesApi } from '../modules/school-structure/infra/resources-http-api.ts';
import { resourcesApiKey } from '../modules/school-structure/presentation/resources-key.ts';
import { createShiftsApi } from '../modules/school-structure/infra/shifts-http-api.ts';
import { shiftsApiKey } from '../modules/school-structure/presentation/shifts-key.ts';
import { SubjectsHttpApi } from '../modules/school-structure/infra/subjects-http-api.ts';
import { subjectsApiKey } from '../modules/school-structure/presentation/subjects-key.ts';
import { createTeachersApi } from '../modules/teaching/infra/teachers-http-api.ts';
import { teachersApiKey } from '../modules/teaching/presentation/teachers-key.ts';
import { accessApiKey, createSessionStore } from '../modules/access/presentation/session-store.ts';
import { AuthenticationHttpApi } from '../modules/access/infra/authentication-http-api.ts';
import { FetchHttpClient } from '../shared/infra/http/fetch-http-client.ts';
import { accountsApiKey } from '../modules/access/presentation/accounts-key.ts';
import { createAccountsApi } from '../modules/access/infra/accounts-http-api.ts';
import { planningsApiKey } from '../modules/planning/presentation/plannings-key.ts';
import { createPlanningsApi } from '../modules/planning/infra/plannings-http-api.ts';
import { auditApiKey } from '../modules/access/presentation/audit-key.ts';
import { createAuditApi } from '../modules/access/infra/audit-http-api.ts';
import { gridApiKey } from '../modules/planning/presentation/grid-key.ts';
import { createGridApi } from '../modules/planning/infra/grid-http-api.ts';
import { generationApiKey } from '../modules/generation/presentation/generation-key.ts';
import { createGenerationApi } from '../modules/generation/infra/generation-http-api.ts';

export function composeWebApp() {
  const client = new FetchHttpClient({
    onSessionExpired: () => {
      session.session.value = null;
      void router.push('/entrar');
    },
  });
  const session = createSessionStore(new AuthenticationHttpApi(client));
  const router = createAppRouter(session);
  const app = createApp(App)
    .use(router)
    .provide(accessApiKey, session)
    .provide(accountsApiKey, createAccountsApi(client))
    .provide(planningsApiKey, createPlanningsApi(client))
    .provide(auditApiKey, createAuditApi(client))
    .provide(subjectsApiKey, new SubjectsHttpApi(client))
    .provide(classGroupsApiKey, createClassGroupsApi(client))
    .provide(shiftsApiKey, createShiftsApi(client))
    .provide(resourcesApiKey, createResourcesApi(client))
    .provide(teachersApiKey, createTeachersApi(client))
    .provide(assignmentsApiKey, createAssignmentsApi(client))
    .provide(gridApiKey, createGridApi(client))
    .provide(generationApiKey, createGenerationApi(client));

  return { app, router, session };
}
