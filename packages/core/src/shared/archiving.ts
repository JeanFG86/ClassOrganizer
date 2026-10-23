/** Situação de um cadastro que pode ser arquivado. */
export type EntityStatus = 'active' | 'archived';

export function statusOf(entity: { archivedAt: Date | null }): EntityStatus {
  return entity.archivedAt ? 'archived' : 'active';
}
