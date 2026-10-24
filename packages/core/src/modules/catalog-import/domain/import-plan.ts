import { DomainError } from '../../../shared/domain-error.ts';
import { cleanName, normalizeName } from '../../../shared/names.ts';
import {
  ClassGroupEntity,
  ClassGroupNameAlreadyInUseError,
  SubjectEntity,
  SubjectNameAlreadyInUseError,
  type ClassGroup,
  type Resource,
  type Shift,
  type Subject,
} from '../../school-structure/domain/index.ts';
import {
  InvalidWeeklyLessonsError,
  MAX_WEEKLY_LESSONS,
  TeacherEntity,
  TeachingAssignmentEntity,
  type AssignmentParticipant,
  type Teacher,
  type TeachingAssignment,
} from '../../teaching/domain/index.ts';
import { InvalidCsvError, parseCsv, type CsvRecord } from './csv.ts';
import {
  CATALOG_IMPORT_LAYOUTS,
  LIST_SEPARATOR,
  columnKey,
  type CatalogImportKind,
  type ImportColumn,
  type ImportLayout,
} from './layouts.ts';

/** Cadastros atuais com que cada linha é comparada, ativos e arquivados. */
export interface CatalogImportState {
  readonly subjects: readonly Subject[];
  readonly classGroups: readonly ClassGroup[];
  readonly shifts: readonly Shift[];
  readonly resources: readonly Resource[];
  readonly teachers: readonly Teacher[];
  readonly assignments: readonly TeachingAssignment[];
}

/** `create`: será cadastrado; `existing`: já existe e fica como está; `invalid`: tem erro. */
export type ImportRowStatus = 'create' | 'existing' | 'invalid';

export interface ImportMessage {
  readonly severity: 'error' | 'warning';
  readonly text: string;
}

export interface ImportRow {
  readonly line: number;
  /** Valores lidos nas colunas presentes, na ordem do modelo. */
  readonly cells: readonly string[];
  readonly status: ImportRowStatus;
  readonly messages: readonly ImportMessage[];
}

/** Gravação planejada; somente cadastros novos, nunca alterações nos existentes. */
export type ImportWrite =
  | { readonly type: 'subject'; readonly subject: Subject }
  | {
      readonly type: 'classGroup';
      readonly classGroup: ClassGroup;
      /** Turno e aulas gravados depois do cadastro; `null` para turma sem turno. */
      readonly schedule: ClassGroup | null;
    }
  | { readonly type: 'teacher'; readonly teacher: Teacher }
  | { readonly type: 'assignment'; readonly assignment: TeachingAssignment };

export interface CatalogImportPlan {
  readonly kind: CatalogImportKind;
  /** Títulos das colunas presentes no arquivo, na ordem do modelo. */
  readonly columns: readonly string[];
  /** Problemas do arquivo inteiro (formato ou cabeçalho); com eles, nenhuma linha é lida. */
  readonly fileErrors: readonly string[];
  readonly rows: readonly ImportRow[];
  readonly writes: readonly ImportWrite[];
}

export interface CatalogImportSummary {
  readonly total: number;
  readonly create: number;
  readonly existing: number;
  readonly invalid: number;
}

export function summarizeImport(plan: CatalogImportPlan): CatalogImportSummary {
  const count = (status: ImportRowStatus) => plan.rows.filter((r) => r.status === status).length;
  return {
    total: plan.rows.length,
    create: count('create'),
    existing: count('existing'),
    invalid: count('invalid'),
  };
}

/** A importação só é gravada quando o arquivo e todas as linhas estão corretos. */
export function importIsValid(plan: CatalogImportPlan): boolean {
  return plan.fileErrors.length === 0 && plan.rows.every((row) => row.status !== 'invalid');
}

interface DraftRow {
  line: number;
  cells: string[];
  status: ImportRowStatus;
  messages: ImportMessage[];
}

function fail(row: DraftRow, text: string): void {
  row.status = 'invalid';
  row.messages.push({ severity: 'error', text });
}

function warn(row: DraftRow, text: string): void {
  row.messages.push({ severity: 'warning', text });
}

/** Executa a validação do domínio e converte o erro em mensagem da linha. */
function attempt<T>(row: DraftRow, build: () => T): T | null {
  try {
    return build();
  } catch (error) {
    if (error instanceof DomainError) {
      fail(row, error.message);
      return null;
    }
    throw error;
  }
}

function byName<T extends { readonly name: string }>(items: readonly T[]): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const item of items) {
    const key = normalizeName(item.name);
    index.set(key, [...(index.get(key) ?? []), item]);
  }
  return index;
}

/** Vazio: `null`; somente dígitos: o número; o restante é inválido. */
function integer(raw: string): number | null | 'invalid' {
  if (raw === '') return null;
  return /^\d{1,4}$/.test(raw) ? Number(raw) : 'invalid';
}

function splitList(raw: string): string[] {
  return raw
    .split(LIST_SEPARATOR)
    .map(cleanName)
    .filter((name) => name !== '');
}

interface Entry {
  readonly row: DraftRow;
  read(key: string): string;
}

interface Columns {
  readonly present: readonly ImportColumn[];
  readonly indexes: ReadonlyMap<string, number>;
}

function mapHeader(layout: ImportLayout, header: CsvRecord): Columns | { errors: string[] } {
  const known = new Map<string, ImportColumn>();
  for (const column of layout.columns) {
    for (const title of [column.title, column.key, ...column.aliases]) {
      known.set(columnKey(title), column);
    }
  }
  const indexes = new Map<string, number>();
  const errors: string[] = [];
  header.cells.forEach((cell, index) => {
    const key = columnKey(cell);
    if (key === '') return;
    const column = known.get(key);
    if (!column) {
      errors.push(`A coluna "${cleanName(cell)}" não faz parte do modelo de ${layout.label}.`);
    } else if (indexes.has(column.key)) {
      errors.push(`A coluna "${column.title}" aparece mais de uma vez.`);
    } else {
      indexes.set(column.key, index);
    }
  });
  for (const column of layout.columns) {
    if (column.required && !indexes.has(column.key)) {
      errors.push(`Falta a coluna "${column.title}".`);
    }
  }
  if (errors.length > 0) {
    errors.push(`Use as colunas do modelo: ${layout.columns.map((c) => c.title).join(', ')}.`);
    return { errors };
  }
  return { present: layout.columns.filter((c) => indexes.has(c.key)), indexes };
}

function entryOf(record: CsvRecord, columns: Columns): Entry {
  const read = (key: string) => {
    const index = columns.indexes.get(key);
    return index === undefined ? '' : cleanName(record.cells[index] ?? '');
  };
  const row: DraftRow = {
    line: record.line,
    cells: columns.present.map((column) => read(column.key)),
    status: 'create',
    messages: [],
  };
  const used = new Set(columns.indexes.values());
  if (record.cells.some((cell, index) => !used.has(index) && cell.trim() !== '')) {
    fail(row, 'A linha tem valores fora das colunas do cabeçalho.');
  }
  return { row, read };
}

interface PlanContext {
  readonly state: CatalogImportState;
  readonly now: Date;
  readonly nextId: () => string;
  readonly columns: Columns;
  readonly writes: ImportWrite[];
}

/** Uma linha repetida no próprio arquivo é erro, para não esconder um nome trocado. */
function repeated(row: DraftRow, seen: Map<string, number>, key: string, what: string): boolean {
  const first = seen.get(key);
  if (first !== undefined) {
    fail(row, `Repete ${what} da linha ${first}.`);
    return true;
  }
  seen.set(key, row.line);
  return false;
}

function planSubjects(entries: readonly Entry[], context: PlanContext): void {
  const existing = byName(context.state.subjects);
  const seen = new Map<string, number>();
  for (const { row, read } of entries) {
    const subject = attempt(row, () =>
      SubjectEntity.create({
        id: context.nextId(),
        name: read('name'),
        createdAt: context.now,
      }).snapshot(),
    );
    if (!subject || row.status === 'invalid') continue;
    if (repeated(row, seen, subject.normalizedName, 'a disciplina')) continue;
    const current = existing.get(subject.normalizedName)?.[0];
    if (current?.archivedAt) {
      fail(row, new SubjectNameAlreadyInUseError(current).message);
    } else if (current) {
      row.status = 'existing';
    } else {
      context.writes.push({ type: 'subject', subject });
    }
  }
}

function planClassGroups(entries: readonly Entry[], context: PlanContext): void {
  const existing = byName(context.state.classGroups);
  const shifts = byName(context.state.shifts);
  const seen = new Map<string, number>();
  for (const { row, read } of entries) {
    const entity = attempt(row, () =>
      ClassGroupEntity.create({ id: context.nextId(), name: read('name'), createdAt: context.now }),
    );
    const shiftName = read('shift');
    const periods = integer(read('periods'));
    let schedule: ClassGroup | null = null;
    if (shiftName === '') {
      if (periods !== null) fail(row, 'Informe o turno para indicar as aulas da turma.');
    } else {
      const shift = shifts.get(normalizeName(shiftName))?.[0];
      const total = shift?.periods.length ?? 0;
      if (!shift) {
        fail(row, `O turno "${shiftName}" não está cadastrado. Cadastre-o na tela de turnos.`);
      } else if (periods === 'invalid') {
        fail(row, 'Informe em "Aulas do turno" um número inteiro.');
      } else if (periods !== null && (periods < 1 || periods > total)) {
        fail(row, `O turno "${shift.name}" tem ${total} aulas; informe de 1 a ${total}.`);
      } else if (entity) {
        const chosen = shift.periods.slice(0, periods ?? total).map((period) => period.id);
        schedule = attempt(row, () => entity.schedule(shift, chosen).snapshot());
      }
    }
    if (!entity || row.status === 'invalid') continue;
    const classGroup = entity.snapshot();
    if (repeated(row, seen, classGroup.normalizedName, 'a turma')) continue;
    const current = existing.get(classGroup.normalizedName)?.[0];
    if (current?.archivedAt) {
      fail(row, new ClassGroupNameAlreadyInUseError(current).message);
    } else if (current) {
      row.status = 'existing';
      if (
        schedule &&
        (current.shiftId !== schedule.shiftId ||
          current.periodIds.join() !== schedule.periodIds.join())
      ) {
        warn(
          row,
          'A turma já está cadastrada com outro turno ou outras aulas e não será alterada. ' +
            'Ajuste-a na tela de turmas.',
        );
      }
    } else {
      context.writes.push({ type: 'classGroup', classGroup, schedule });
    }
  }
}

function resolveSubjects(
  row: DraftRow,
  names: readonly string[],
  subjects: ReadonlyMap<string, readonly Subject[]>,
): string[] {
  const ids: string[] = [];
  for (const name of names) {
    const subject = subjects.get(normalizeName(name))?.[0];
    if (!subject) {
      fail(
        row,
        `A disciplina "${name}" não está cadastrada.` +
          (name.includes(',') ? ` Separe várias disciplinas com "${LIST_SEPARATOR}".` : ''),
      );
    } else if (subject.archivedAt) {
      fail(row, `A disciplina "${subject.name}" está arquivada.`);
    } else {
      ids.push(subject.id);
    }
  }
  return ids;
}

function planTeachers(entries: readonly Entry[], context: PlanContext): void {
  const existing = byName(context.state.teachers);
  const subjects = byName(context.state.subjects);
  const has = (key: string) => context.columns.indexes.has(key);
  const seen = new Map<string, number>();
  for (const { row, read } of entries) {
    const subjectIds = resolveSubjects(row, splitList(read('subjects')), subjects);
    const maxWeeklyLessons = integer(read('maxWeeklyLessons'));
    const planningPeriods = integer(read('planningPeriods'));
    if (maxWeeklyLessons === 'invalid') {
      fail(row, 'A carga máxima deve ser um número inteiro de aulas por semana.');
    }
    if (planningPeriods === 'invalid') {
      fail(row, 'A hora-atividade deve ser um número inteiro de aulas por semana.');
    }
    const teacher = attempt(row, () =>
      TeacherEntity.create({
        id: context.nextId(),
        name: read('name'),
        subjectIds,
        createdAt: context.now,
        maxWeeklyLessons: maxWeeklyLessons === 'invalid' ? null : maxWeeklyLessons,
        planningPeriods: planningPeriods === 'invalid' ? 0 : (planningPeriods ?? 0),
      }).snapshot(),
    );
    if (!teacher || row.status === 'invalid') continue;
    const key = normalizeName(teacher.name);
    if (repeated(row, seen, key, 'o professor')) continue;
    const matches = existing.get(key) ?? [];
    const active = matches.filter((current) => !current.archivedAt);
    if (active.length > 0) {
      row.status = 'existing';
      const differs = (current: Teacher) =>
        (has('subjects') &&
          current.subjectIds.toSorted().join() !== teacher.subjectIds.toSorted().join()) ||
        (has('maxWeeklyLessons') && current.maxWeeklyLessons !== teacher.maxWeeklyLessons) ||
        (has('planningPeriods') && current.planningPeriods !== teacher.planningPeriods);
      if (active.every(differs)) {
        warn(
          row,
          'O professor já está cadastrado com outros dados e não será alterado. ' +
            'Ajuste-o na tela de professores.',
        );
      }
    } else if (matches.length > 0) {
      fail(
        row,
        'Já existe um professor arquivado com este nome. Restaure-o na lista de arquivados ' +
          'da tela de professores.',
      );
    } else {
      context.writes.push({ type: 'teacher', teacher });
    }
  }
}

interface AssignmentLine {
  readonly entry: Entry;
  readonly classGroup: ClassGroup | undefined;
  readonly participant: AssignmentParticipant | undefined;
  readonly weeklyLessons: number | undefined;
  readonly resourceIds: readonly string[];
  readonly block: string;
}

function activeByName<T extends { readonly name: string; readonly archivedAt: Date | null }>(
  row: DraftRow,
  index: ReadonlyMap<string, readonly T[]>,
  name: string,
  what: { empty: string; missing: string; archived: string },
): T | undefined {
  if (name === '') {
    fail(row, what.empty);
    return undefined;
  }
  const matches = index.get(normalizeName(name)) ?? [];
  const active = matches.filter((item) => !item.archivedAt);
  if (active.length === 0) {
    fail(row, matches.length > 0 ? what.archived : what.missing);
    return undefined;
  }
  if (active.length > 1) {
    fail(
      row,
      `Há ${active.length} cadastros ativos chamados "${name}". ` +
        'Registre esta atribuição na tela de atribuições.',
    );
    return undefined;
  }
  return active[0];
}

function readAssignmentLine(
  entry: Entry,
  indexes: {
    classGroups: ReadonlyMap<string, readonly ClassGroup[]>;
    subjects: ReadonlyMap<string, readonly Subject[]>;
    teachers: ReadonlyMap<string, readonly Teacher[]>;
    resources: ReadonlyMap<string, readonly Resource[]>;
  },
): AssignmentLine {
  const { row, read } = entry;
  const classGroupName = read('classGroup');
  const subjectName = read('subject');
  const teacherName = read('teacher');
  const classGroup = activeByName(row, indexes.classGroups, classGroupName, {
    empty: 'Informe a turma.',
    missing: `A turma "${classGroupName}" não está cadastrada.`,
    archived: `A turma "${classGroupName}" está arquivada.`,
  });
  const subject = activeByName(row, indexes.subjects, subjectName, {
    empty: 'Informe a disciplina.',
    missing: `A disciplina "${subjectName}" não está cadastrada.`,
    archived: `A disciplina "${subjectName}" está arquivada.`,
  });
  const teacher = activeByName(row, indexes.teachers, teacherName, {
    empty: 'Informe o professor.',
    missing: `O professor "${teacherName}" não está cadastrado.`,
    archived: `O professor "${teacherName}" está arquivado.`,
  });
  if (teacher && subject && !teacher.subjectIds.includes(subject.id)) {
    fail(
      row,
      `O professor "${teacher.name}" não está habilitado em "${subject.name}". ` +
        'Habilite-o na tela de professores ou corrija a linha.',
    );
  }
  const weeklyLessons = integer(read('weeklyLessons'));
  if (weeklyLessons === null) {
    fail(row, 'Informe as aulas por semana.');
  } else if (
    weeklyLessons === 'invalid' ||
    weeklyLessons < 1 ||
    weeklyLessons > MAX_WEEKLY_LESSONS
  ) {
    fail(row, new InvalidWeeklyLessonsError().message);
  }
  const resourceIds: string[] = [];
  for (const name of splitList(read('resources'))) {
    const resource = activeByName(row, indexes.resources, name, {
      empty: '',
      missing: `O recurso "${name}" não está cadastrado.`,
      archived: `O recurso "${name}" está arquivado.`,
    });
    if (resource) resourceIds.push(resource.id);
  }
  return {
    entry,
    classGroup,
    participant: teacher && subject ? { teacherId: teacher.id, subjectId: subject.id } : undefined,
    weeklyLessons: typeof weeklyLessons === 'number' ? weeklyLessons : undefined,
    resourceIds,
    block: read('block'),
  };
}

function signature(
  assignment: Pick<
    TeachingAssignment,
    'classGroupId' | 'participants' | 'weeklyLessons' | 'resourceIds'
  >,
): string {
  return [
    assignment.classGroupId,
    assignment.participants
      .map((p) => `${p.teacherId}:${p.subjectId}`)
      .toSorted()
      .join(','),
    assignment.weeklyLessons,
    assignment.resourceIds.toSorted().join(','),
  ].join('|');
}

/**
 * Cada linha é um professor em uma turma. Linhas da mesma turma com o mesmo código em
 * "Bloco" formam um bloco de aulas simultâneas (ADR 0009). Um bloco idêntico a outro já
 * cadastrado é mantido, de modo que reimportar o mesmo arquivo não duplica as cargas.
 */
function planAssignments(entries: readonly Entry[], context: PlanContext): void {
  const { state } = context;
  const indexes = {
    classGroups: byName(state.classGroups),
    subjects: byName(state.subjects),
    teachers: byName(state.teachers),
    resources: byName(state.resources),
  };
  const groups = new Map<string, AssignmentLine[]>();
  for (const entry of entries) {
    const line = readAssignmentLine(entry, indexes);
    const key = line.block
      ? `${normalizeName(entry.read('classGroup'))}\u0000${normalizeName(line.block)}`
      : `line:${entry.row.line}`;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }

  const available = new Map<string, number>();
  for (const assignment of state.assignments) {
    const key = signature(assignment);
    available.set(key, (available.get(key) ?? 0) + 1);
  }
  const names = new Map<string, string>(
    [...state.subjects, ...state.teachers].map((item) => [item.id, item.name]),
  );
  const assigned = new Map<string, number>();

  for (const lines of groups.values()) {
    const rows = lines.map((line) => line.entry.row);
    const block = lines[0]?.block ?? '';
    if (new Set(lines.flatMap((line) => line.weeklyLessons ?? [])).size > 1) {
      rows.forEach((row) =>
        fail(row, `As linhas do bloco "${block}" informam aulas por semana diferentes.`),
      );
    }
    const invalid = rows.filter((row) => row.status === 'invalid').map((row) => row.line);
    if (invalid.length > 0) {
      for (const row of rows) {
        if (row.status !== 'invalid') {
          fail(row, `O bloco "${block}" tem erro na linha ${invalid.join(', ')}.`);
        }
      }
      continue;
    }
    const [first] = lines;
    if (!first?.classGroup || first.weeklyLessons === undefined) continue;
    const { classGroup, weeklyLessons } = first;
    const participants = lines.flatMap((line) => (line.participant ? [line.participant] : []));
    let assignment: TeachingAssignment;
    try {
      assignment = TeachingAssignmentEntity.create({
        id: context.nextId(),
        classGroupId: classGroup.id,
        participants,
        weeklyLessons,
        resourceIds: [...new Set(lines.flatMap((line) => line.resourceIds))],
        createdAt: context.now,
      }).snapshot();
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      rows.forEach((row) => fail(row, error.message));
      continue;
    }

    const key = signature(assignment);
    const remaining = available.get(key) ?? 0;
    if (remaining > 0) {
      available.set(key, remaining - 1);
      rows.forEach((row) => (row.status = 'existing'));
      continue;
    }
    for (const line of lines) {
      const participant = line.participant;
      if (!participant) continue;
      const pair = `${classGroup.id}|${participant.teacherId}|${participant.subjectId}`;
      const subjectName = names.get(participant.subjectId) ?? '';
      const teacherName = names.get(participant.teacherId) ?? '';
      const current = state.assignments.some(
        (other) =>
          other.classGroupId === classGroup.id &&
          other.participants.some(
            (p) => p.teacherId === participant.teacherId && p.subjectId === participant.subjectId,
          ),
      );
      const previous = assigned.get(pair);
      if (current) {
        warn(
          line.entry.row,
          `A turma já tem aulas de "${subjectName}" com "${teacherName}"; ` +
            'este bloco será somado à carga atual.',
        );
      } else if (previous !== undefined) {
        warn(
          line.entry.row,
          `A linha ${previous} também atribui "${subjectName}" a "${teacherName}" nesta turma; ` +
            'serão blocos separados.',
        );
      }
      if (previous === undefined) assigned.set(pair, line.entry.row.line);
    }
    context.writes.push({ type: 'assignment', assignment });
  }
}

const PLANNERS: {
  readonly [Kind in CatalogImportKind]: (entries: readonly Entry[], context: PlanContext) => void;
} = {
  subjects: planSubjects,
  classGroups: planClassGroups,
  teachers: planTeachers,
  assignments: planAssignments,
};

function freeze(row: DraftRow): ImportRow {
  return { line: row.line, cells: row.cells, status: row.status, messages: row.messages };
}

/**
 * Lê o arquivo e decide, linha a linha, o que seria cadastrado. É uma função pura: a
 * prévia e a confirmação usam o mesmo plano e só a confirmação grava `writes`.
 */
export function planCatalogImport(input: {
  kind: CatalogImportKind;
  content: string;
  state: CatalogImportState;
  now: Date;
  nextId: () => string;
}): CatalogImportPlan {
  const layout = CATALOG_IMPORT_LAYOUTS[input.kind];
  const empty = (fileErrors: string[]): CatalogImportPlan => ({
    kind: input.kind,
    columns: [],
    fileErrors,
    rows: [],
    writes: [],
  });
  let table;
  try {
    table = parseCsv(input.content);
  } catch (error) {
    if (error instanceof InvalidCsvError) return empty([error.message]);
    throw error;
  }
  const columns = mapHeader(layout, table.header);
  if ('errors' in columns) return empty(columns.errors);
  if (table.records.length === 0) {
    return empty(['O arquivo tem apenas o cabeçalho. Preencha uma linha por item.']);
  }
  const entries = table.records.map((record) => entryOf(record, columns));
  const writes: ImportWrite[] = [];
  PLANNERS[input.kind](entries, {
    state: input.state,
    now: input.now,
    nextId: input.nextId,
    columns,
    writes,
  });
  const valid = entries.every((entry) => entry.row.status !== 'invalid');
  return {
    kind: input.kind,
    columns: columns.present.map((column) => column.title),
    fileErrors: [],
    rows: entries.map((entry) => freeze(entry.row)),
    writes: valid ? writes : [],
  };
}

/**
 * Texto que representa o resultado mostrado na prévia: tipo, colunas, problemas e cada
 * linha com valores, situação e mensagens. Não inclui identificadores gerados.
 */
export function importFingerprint(plan: Omit<CatalogImportPlan, 'writes'>): string {
  return JSON.stringify([plan.kind, plan.columns, plan.fileErrors, plan.rows]);
}
