import { cleanName, normalizeName } from '../../../shared/names.ts';
import { csvCell } from './csv.ts';

/** Cadastros que podem ser importados, na ordem em que dependem uns dos outros. */
export const CATALOG_IMPORT_KINDS = ['subjects', 'classGroups', 'teachers', 'assignments'] as const;
export type CatalogImportKind = (typeof CATALOG_IMPORT_KINDS)[number];

export function isCatalogImportKind(value: string): value is CatalogImportKind {
  return (CATALOG_IMPORT_KINDS as readonly string[]).includes(value);
}

/** Separa vários nomes dentro da mesma célula (disciplinas, recursos). */
export const LIST_SEPARATOR = '|';

export interface ImportColumn {
  readonly key: string;
  /** Título do modelo; maiúsculas, acentos, `_` e `-` não importam na leitura. */
  readonly title: string;
  readonly required: boolean;
  readonly aliases: readonly string[];
}

export interface ImportLayout {
  readonly label: string;
  readonly fileName: string;
  readonly columns: readonly ImportColumn[];
  /** Linhas inventadas que mostram o preenchimento no modelo. */
  readonly example: readonly (readonly string[])[];
}

function column(
  key: string,
  title: string,
  required: boolean,
  aliases: readonly string[] = [],
): ImportColumn {
  return { key, title, required, aliases };
}

export const CATALOG_IMPORT_LAYOUTS: { readonly [Kind in CatalogImportKind]: ImportLayout } = {
  subjects: {
    label: 'disciplinas',
    fileName: 'modelo-disciplinas.csv',
    columns: [column('name', 'Disciplina', true, ['nome'])],
    example: [['Matemática'], ['Língua Portuguesa'], ['Ciências'], ['Arte']],
  },
  classGroups: {
    label: 'turmas',
    fileName: 'modelo-turmas.csv',
    columns: [
      column('name', 'Turma', true, ['nome']),
      column('shift', 'Turno', false),
      column('periods', 'Aulas do turno', false, ['aulas', 'aulas por dia']),
    ],
    example: [
      ['6º ano A', 'Manhã', '5'],
      ['6º ano B', 'Manhã', ''],
      ['7º ano A', '', ''],
    ],
  },
  teachers: {
    label: 'professores',
    fileName: 'modelo-professores.csv',
    columns: [
      column('name', 'Professor', true, ['nome', 'professora']),
      column('subjects', 'Disciplinas', false, ['habilitacoes']),
      column('maxWeeklyLessons', 'Carga máxima', false, ['carga maxima semanal']),
      column('planningPeriods', 'Hora-atividade', false, ['ha']),
    ],
    example: [
      ['Ana Exemplo', `Matemática${LIST_SEPARATOR}Ciências`, '20', '2'],
      ['Otávio Modelo', `Língua Portuguesa${LIST_SEPARATOR}Arte`, '', '1'],
      ['Carla Teste', 'Arte', '10', '0'],
    ],
  },
  assignments: {
    label: 'atribuições',
    fileName: 'modelo-atribuicoes.csv',
    columns: [
      column('classGroup', 'Turma', true),
      column('subject', 'Disciplina', true),
      column('teacher', 'Professor', true, ['professora']),
      column('weeklyLessons', 'Aulas por semana', true, ['aulas semana', 'aulas']),
      column('block', 'Bloco', false),
      column('resources', 'Recursos', false),
    ],
    example: [
      ['6º ano A', 'Matemática', 'Ana Exemplo', '5', '', ''],
      ['6º ano A', 'Língua Portuguesa', 'Otávio Modelo', '5', '', ''],
      ['6º ano A', 'Arte', 'Otávio Modelo', '2', 'Arte em dupla', ''],
      ['6º ano A', 'Arte', 'Carla Teste', '2', 'Arte em dupla', ''],
    ],
  },
};

/** Chave de comparação dos títulos de coluna. */
export function columnKey(title: string): string {
  return cleanName(normalizeName(title).replace(/[_\-.]+/g, ' '));
}

/** Modelo CSV com BOM, para o Excel reconhecer UTF-8, e separador ponto e vírgula. */
export function catalogImportTemplate(kind: CatalogImportKind): {
  fileName: string;
  content: string;
} {
  const layout = CATALOG_IMPORT_LAYOUTS[kind];
  const lines = [layout.columns.map((c) => c.title), ...layout.example].map((cells) =>
    cells.map((cell) => csvCell(cell)).join(';'),
  );
  return { fileName: layout.fileName, content: '\uFEFF' + lines.join('\r\n') + '\r\n' };
}
