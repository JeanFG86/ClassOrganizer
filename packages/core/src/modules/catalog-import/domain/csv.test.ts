import { describe, expect, it } from 'vitest';
import { CSV_MAX_ROWS, InvalidCsvError, csvCell, parseCsv } from './csv.ts';
import { CATALOG_IMPORT_KINDS, CATALOG_IMPORT_LAYOUTS, catalogImportTemplate } from './layouts.ts';

describe('leitura de CSV', () => {
  it('detecta ponto e vírgula, ignora o BOM e numera as linhas do arquivo', () => {
    const table = parseCsv('\uFEFFTurma;Turno\r\n\r\n6º ano A;Manhã\r\n7º ano B;Tarde');

    expect(table.delimiter).toBe(';');
    expect(table.header).toEqual({ line: 1, cells: ['Turma', 'Turno'] });
    expect(table.records).toEqual([
      { line: 3, cells: ['6º ano A', 'Manhã'] },
      { line: 4, cells: ['7º ano B', 'Tarde'] },
    ]);
  });

  it('aceita vírgula e tabulação como separador', () => {
    expect(parseCsv('a,b\n1,2\n').records).toEqual([{ line: 2, cells: ['1', '2'] }]);
    expect(parseCsv('a\tb\n1\t2').delimiter).toBe('\t');
  });

  it('lê aspas com separadores, aspas duplicadas e quebras de linha no valor', () => {
    const table = parseCsv('Nome;Obs\n"Silva; Ana";"diz ""oi"""\n"duas\nlinhas";x\nfim;y');

    expect(table.records).toEqual([
      { line: 2, cells: ['Silva; Ana', 'diz "oi"'] },
      { line: 3, cells: ['duas\nlinhas', 'x'] },
      { line: 5, cells: ['fim', 'y'] },
    ]);
  });

  it('recusa aspas sem fechamento, arquivo vazio e linhas demais', () => {
    expect(() => parseCsv('a;b\n"aberto;1\n2;3')).toThrow(InvalidCsvError);
    expect(() => parseCsv('a;b\n"aberto;1\n2;3')).toThrow(/linha 2/);
    expect(() => parseCsv('\uFEFF\r\n  ;  \r\n')).toThrow(/vazio/);
    const many = ['Disciplina', ...Array.from({ length: CSV_MAX_ROWS + 1 }, (_, i) => `D${i}`)];
    expect(() => parseCsv(many.join('\n'))).toThrow(/Divida-o/);
  });

  it('protege células com separador, aspas ou quebra de linha', () => {
    expect(csvCell('simples')).toBe('simples');
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvCell('a,b', ',')).toBe('"a,b"');
  });

  it.each(CATALOG_IMPORT_KINDS)('o modelo de %s é lido com as colunas do layout', (kind) => {
    const template = catalogImportTemplate(kind);
    const table = parseCsv(template.content);
    const layout = CATALOG_IMPORT_LAYOUTS[kind];

    expect(template.content.startsWith('\uFEFF')).toBe(true);
    expect(template.fileName).toMatch(/^modelo-[a-z]+\.csv$/);
    expect(table.header.cells).toEqual(layout.columns.map((column) => column.title));
    expect(table.records.map((record) => record.cells)).toEqual(layout.example);
  });
});
