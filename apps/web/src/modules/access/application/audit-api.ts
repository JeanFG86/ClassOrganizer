import type { auditsSchema } from '@classorganizer/contracts';

import type { z } from 'zod';
export interface AuditApi {
  audits(before?: { occurredAt: string; id: string }): Promise<z.infer<typeof auditsSchema>>;
}
