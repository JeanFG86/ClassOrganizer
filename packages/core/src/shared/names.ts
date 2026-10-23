/** Remove espaços nas pontas e colapsa espaços internos repetidos. */
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Chave de comparação que ignora maiúsculas, acentos e espaços extras. */
export function normalizeName(name: string): string {
  return cleanName(name)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/** Ordenação alfabética em português (acentos não alteram a posição; números em ordem natural). */
export function compareNames(a: string, b: string): number {
  return collator.compare(a, b);
}
