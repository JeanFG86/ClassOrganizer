/** Relógio injetável para manter casos de uso determinísticos nos testes. */
export interface Clock {
  now(): Date;
}

/** Gerador de identificadores injetável. */
export interface IdGenerator {
  next(): string;
}
