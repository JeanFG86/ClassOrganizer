const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids que não são UUID não existem no banco; filtrá-los evita erro de conversão do PostgreSQL. */
export function isUuid(id: string): boolean {
  return UUID_PATTERN.test(id);
}
