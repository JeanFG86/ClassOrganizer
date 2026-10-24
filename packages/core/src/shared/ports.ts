/** Relógio injetável para manter casos de uso determinísticos nos testes. */
export interface Clock {
  now(): Date;
}

/** Gerador de identificadores injetável. */
export interface IdGenerator {
  next(): string;
}

/** Resumo criptográfico de um texto, em hexadecimal. */
export interface Digest {
  of(text: string): string;
}

/** Sementes da busca, de 0 a 4294967295. */
export interface SeedGenerator {
  next(): number;
}
