import { z } from 'zod';

export const roleSchema = z.enum(['admin', 'editor', 'viewer']);

export const credentialsSchema = z.object({
  username: z.string().min(1).max(40),
  password: z.string().min(1).max(128),
});

export const userAccountSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  role: roleSchema,
  disabled: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});

export const sessionSchema = z.object({ user: userAccountSchema, expiresAt: z.iso.datetime() });

export const createUserSchema = credentialsSchema.extend({ role: roleSchema });

export const changeUserSchema = z.object({
  version: z.number().int().positive(),
  role: roleSchema,
  disabled: z.boolean(),
  password: z.string().min(5).max(128).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  password: z.string().min(5).max(128),
});

export const usersSchema = z.array(userAccountSchema);

export const auditEventSchema = z.object({
  id: z.uuid(),
  actorId: z.uuid(),
  actor: z.object({ username: z.string() }),
  action: z.string(),
  entityId: z.uuid().nullable(),
  occurredAt: z.iso.datetime(),
});

export const auditsSchema = z.array(auditEventSchema);

export type Session = z.infer<typeof sessionSchema>;

export type UserAccountDto = z.infer<typeof userAccountSchema>;
