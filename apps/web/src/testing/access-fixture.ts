import { FetchHttpClient } from '../shared/infra/http/fetch-http-client.ts';
import { createAuthenticationApi } from '../modules/access/infra/authentication-http-api.ts';
import { createSessionStore } from '../modules/access/presentation/session-store.ts';
import { createAccountsApi } from '../modules/access/infra/accounts-http-api.ts';
import { createPlanningsApi } from '../modules/planning/infra/plannings-http-api.ts';
import { createAuditApi } from '../modules/access/infra/audit-http-api.ts';
export {
  accessApiKey,
  roleLabels,
  useAccess,
} from '../modules/access/presentation/session-store.ts';
/** Composição de serviços usada apenas pelas fixtures de componentes. */
export function createAccessApi() {
  const client = new FetchHttpClient();
  return {
    ...createSessionStore(createAuthenticationApi(client)),
    ...createAccountsApi(client),
    ...createPlanningsApi(client),
    ...createAuditApi(client),
  };
}
