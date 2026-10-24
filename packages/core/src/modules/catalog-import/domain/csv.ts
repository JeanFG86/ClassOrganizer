import { DomainError } from '../../../shared/domain-error.ts';

/** Tamanho máximo do conteúdo aceito, em caracteres. */
export const CSV_MAX_LENGTH = 400_000;
/** Linhas de dados aceitas por arquivo, sem contar o cabeçalho. */
export const CSV_MAX_ROWS = 1000;

const DELIMITERS = [';', ',', '\t'] as const;
export type CsvDelimiter = (typeof DELIMITERS)[number];

/** Registro do arquivo com a linha física em que começa (o cabeçalho costuma ser a linha 1). */
export interface CsvRecord {
  readonly line: number;
  readonly cells: readonly string[];
}

export interface CsvTable {
  readonly delimiter: CsvDelimiter;
  readonly header: CsvRecord;
  readonly records: readonly CsvRecord[];
}

/** O conteúdo não pôde ser lido como CSV; nenhuma linha é avaliada. */
export class InvalidCsvError extends DomainError {
  readonly code = 'catalog_import.invalid_csv';
  readonly kind = 'validation';
}

/**
 * Escolhe o separador mais frequente na primeira linha. Planilhas em português costumam
 * salvar com ponto e vírgula, que vence os empates.
 */
function detectDelimiter(content: string): CsvDelimiter {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
  let best: CsvDelimiter = ';';
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    const count = firstLine.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

function isBlank(record: CsvRecord): boolean {
  return record.cells.every((cell) => cell.trim() === '');
}

/**
 * Lê um CSV no formato das planilhas (RFC 4180): aspas duplas delimitam valores com
 * separadores ou quebras de linha, e `""` representa uma aspa. Linhas vazias são ignoradas.
 */
export function parseCsv(raw: string): CsvTable {
  if (raw.length > CSV_MAX_LENGTH) {
    throw new InvalidCsvError(
      `O arquivo é grande demais. Divida-o em arquivos de até ${CSV_MAX_ROWS} linhas.`,
    );
  }
  const content = raw.startsWith('\uFEFF') ? raw.slice(1) : raw;
  const delimiter = detectDelimiter(content);
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const endRecord = () => {
    cells.push(field);
    records.push({ line: recordLine, cells });
    cells = [];
    field = '';
  };

  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (quoted) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        if (char === '\n') line++;
        field += char;
      }
    } else if (char === '"' && field.trim() === '') {
      quoted = true;
      field = '';
    } else if (char === delimiter) {
      cells.push(field);
      field = '';
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && content[index + 1] === '\n') index++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      field += char;
    }
  }
  if (quoted) {
    throw new InvalidCsvError(
      `Há aspas sem fechamento a partir da linha ${recordLine}. Confira o arquivo e tente novamente.`,
    );
  }
  if (field !== '' || cells.length > 0) endRecord();

  const filled = records.filter((record) => !isBlank(record));
  const [header, ...rows] = filled;
  if (!header) {
    throw new InvalidCsvError('O arquivo está vazio. Use o modelo e preencha uma linha por item.');
  }
  if (rows.length > CSV_MAX_ROWS) {
    throw new InvalidCsvError(
      `O arquivo tem ${rows.length} linhas. Divida-o em arquivos de até ${CSV_MAX_ROWS} linhas.`,
    );
  }
  return { delimiter, header, records: rows };
}

/** Valor seguro para uma célula de CSV, com aspas quando necessário. */
export function csvCell(value: string, delimiter: CsvDelimiter = ';'): string {
  return value.includes(delimiter) || /["\r\n]/.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}
