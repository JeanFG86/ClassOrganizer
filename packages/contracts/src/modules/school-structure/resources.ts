import { z } from 'zod';
import { versionSchema } from '../../shared/common.ts';

export const registerResourceRequestSchema = z.object({
  name: z.string(),
});

export type RegisterResourceRequest = z.infer<typeof registerResourceRequestSchema>;

export const updateResourceRequestSchema = z.object({
  name: z.string(),
  version: versionSchema,
});

export type UpdateResourceRequest = z.infer<typeof updateResourceRequestSchema>;

export const resourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.iso.datetime(),
  /** Preenchido quando o recurso está arquivado. */
  archivedAt: z.iso.datetime().nullable(),
  version: versionSchema,
});

export type ResourceDto = z.infer<typeof resourceSchema>;

/** Inclui os arquivados; o cliente decide como exibi-las. */
export const resourceListSchema = z.object({
  items: z.array(resourceSchema),
});

export type ResourceListDto = z.infer<typeof resourceListSchema>;
