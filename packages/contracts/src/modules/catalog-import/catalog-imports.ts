import { z } from 'zod';

export const CSV_MEDIA_TYPE = 'text/csv';

/** Cadastros importáveis, na ordem em que dependem uns dos outros. */
export const catalogImportKindSchema = z.enum([
  'subjects',
  'classGroups',
  'teachers',
  'assignments',
]);

export type CatalogImportKind = z.infer<typeof catalogImportKindSchema>;

/** O limite de tamanho do arquivo é aplicado pelo domínio, com mensagem para a secretaria. */
export const catalogImportPreviewRequestSchema = z.object({
  kind: catalogImportKindSchema,
  content: z.string().max(1_000_000),
});

export type CatalogImportPreviewRequest = z.infer<typeof catalogImportPreviewRequestSchema>;

/** Confirmação: o mesmo arquivo da prévia e o resumo do resultado que ela mostrou. */
export const catalogImportRequestSchema = catalogImportPreviewRequestSchema.extend({
  digest: z.string().min(1).max(128),
});

export type CatalogImportRequest = z.infer<typeof catalogImportRequestSchema>;

export const catalogImportTemplateParamsSchema = z.object({ kind: catalogImportKindSchema });

export const catalogImportRowSchema = z.object({
  /** Linha do arquivo, contando o cabeçalho. */
  line: z.number().int().positive(),
  cells: z.array(z.string()),
  status: z.enum(['create', 'existing', 'invalid']),
  messages: z.array(z.object({ severity: z.enum(['error', 'warning']), text: z.string() })),
});

export type CatalogImportRowDto = z.infer<typeof catalogImportRowSchema>;

export const catalogImportPreviewSchema = z.object({
  kind: catalogImportKindSchema,
  /** Enviado na confirmação; muda se o resultado de alguma linha mudar. */
  digest: z.string(),
  columns: z.array(z.string()),
  /** Problemas do arquivo inteiro; com eles, as linhas não são avaliadas. */
  fileErrors: z.array(z.string()),
  summary: z.object({
    total: z.number().int().nonnegative(),
    create: z.number().int().nonnegative(),
    existing: z.number().int().nonnegative(),
    invalid: z.number().int().nonnegative(),
  }),
  rows: z.array(catalogImportRowSchema),
});

export type CatalogImportPreviewDto = z.infer<typeof catalogImportPreviewSchema>;

/** Contagens de linhas: cadastradas agora e já existentes. */
export const catalogImportResultSchema = z.object({
  kind: catalogImportKindSchema,
  created: z.number().int().nonnegative(),
  existing: z.number().int().nonnegative(),
});

export type CatalogImportResultDto = z.infer<typeof catalogImportResultSchema>;
