import { z } from 'zod';

/** Formato único de erro devolvido pela API. `message` é exibível para a secretaria. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
