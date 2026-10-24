import type { AuditApi } from '../application/audit-api.ts';

import { auditsSchema } from '@classorganizer/contracts';

import { type HttpClient } from '../../../shared/application/ports/http-client.ts';
export function createAuditApi(client: HttpClient): AuditApi {
  const apiRequest = client.request.bind(client);
  return {
    audits: (before?: { occurredAt: string; id: string }) =>
      apiRequest(
        auditsSchema,
        '/audit' +
          (before
            ? '?before=' +
              encodeURIComponent(before.occurredAt) +
              '&beforeId=' +
              encodeURIComponent(before.id)
            : ''),
      ),
  };
}
