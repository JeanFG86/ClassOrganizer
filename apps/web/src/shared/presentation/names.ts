const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/** Ordenação alfabética em português, com números em ordem natural ("6º A" antes de "10º A"). */
export function compareNames(a: string, b: string): number {
  return collator.compare(a, b);
}
