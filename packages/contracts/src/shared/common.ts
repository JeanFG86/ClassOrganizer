import { z } from 'zod';

/** Versão do cadastro que o usuário estava vendo (controle otimista de concorrência). */
export const versionSchema = z.number().int().positive();

/** Corpo das ações que só precisam confirmar a versão (arquivar, restaurar). */
export const versionRequestSchema = z.object({ version: versionSchema });

export type VersionRequest = z.infer<typeof versionRequestSchema>;
