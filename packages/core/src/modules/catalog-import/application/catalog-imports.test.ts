import { beforeEach, describe, expect, it } from 'vitest';
import { bindUseCase } from '../../../shared/use-case.ts';
import {
  InMemoryAssignmentRepository,
  InMemoryClassGroupRepository,
  InMemoryResourceRepository,
  InMemoryShiftRepository,
  InMemorySubjectRepository,
  InMemoryTeacherRepository,
} from '../../../testing/in-memory-repositories.ts';
import { ShiftEntity, SubjectEntity } from '../../school-structure/domain/index.ts';
import {
  CatalogImportEmptyError,
  CatalogImportInvalidError,
  CatalogImportStaleError,
} from '../domain/catalog-import-error.ts';
import type { CatalogImportKind } from '../domain/layouts.ts';
import {
  GetCatalogImportTemplate,
  ImportCatalog,
  PreviewCatalogImport,
} from './usecases/catalog-imports.ts';

const now = new Date('2026-02-01T12:00:00Z');

describe('importação de cadastros por CSV', () => {
  let subjects: InMemorySubjectRepository;
  let classGroups: InMemoryClassGroupRepository;
  let shifts: InMemoryShiftRepository;
  let teachers: InMemoryTeacherRepository;
  let assignments: InMemoryAssignmentRepository;
  let preview: PreviewCatalogImport['execute'];
  let importCatalog: ImportCatalog['execute'];

  /** Confirma exatamente o resultado mostrado na prévia. */
  async function confirmed(kind: CatalogImportKind, content: string) {
    const shown = await preview({ kind, content });
    return importCatalog({ kind, content, digest: shown.digest });
  }

  function subject(id: string, name: string) {
    return SubjectEntity.create({ id, name, createdAt: now }).snapshot();
  }

  beforeEach(async () => {
    subjects = new InMemorySubjectRepository();
    classGroups = new InMemoryClassGroupRepository();
    shifts = new InMemoryShiftRepository();
    teachers = new InMemoryTeacherRepository();
    assignments = new InMemoryAssignmentRepository();
    let next = 0;
    const deps = {
      subjects,
      classGroups,
      shifts,
      resources: new InMemoryResourceRepository(),
      teachers,
      assignments,
      clock: { now: () => now },
      ids: { next: () => `id-${++next}` },
      digest: { of: (text: string) => `resumo:${text}` },
    };
    preview = bindUseCase(new PreviewCatalogImport(deps));
    importCatalog = bindUseCase(new ImportCatalog(deps));
    await subjects.add(subject('math', 'Matemática'));
    await shifts.add(
      ShiftEntity.create(
        {
          id: 'morning',
          name: 'Manhã',
          periods: [
            { startMinute: 420, endMinute: 470 },
            { startMinute: 470, endMinute: 520 },
          ],
          createdAt: now,
        },
        { next: () => `period-${++next}` },
      ).snapshot(),
    );
  });

  it('a prévia informa o resultado de cada linha e o resumo para confirmar, sem gravar', async () => {
    const result = await preview({ kind: 'subjects', content: 'Disciplina\nArte\nMatemática' });

    expect(result).toMatchObject({
      kind: 'subjects',
      digest: expect.stringContaining('Arte'),
      columns: ['Disciplina'],
      fileErrors: [],
      summary: { total: 2, create: 1, existing: 1, invalid: 0 },
      rows: [
        { line: 2, cells: ['Arte'], status: 'create', messages: [] },
        { line: 3, cells: ['Matemática'], status: 'existing', messages: [] },
      ],
    });
    expect(result).not.toHaveProperty('writes');
    expect(await subjects.listAll()).toHaveLength(1);
  });

  it('a confirmação grava todas as linhas novas e informa as contagens', async () => {
    const result = await confirmed('subjects', 'Disciplina\nArte\nMatemática\nCiências');

    expect(result).toEqual({ kind: 'subjects', created: 2, existing: 1 });
    expect((await subjects.listAll()).map((s) => s.name).toSorted()).toEqual([
      'Arte',
      'Ciências',
      'Matemática',
    ]);
  });

  it('cadastra a turma e depois grava turno e aulas, como na tela de turmas', async () => {
    await confirmed('classGroups', 'Turma;Turno;Aulas do turno\n6º ano A;Manhã;1\n7º ano A;;');

    const [first, second] = (await classGroups.listAll()).toSorted((a, b) =>
      a.name.localeCompare(b.name),
    );
    expect(first).toMatchObject({ name: '6º ano A', shiftId: 'morning', version: 2 });
    expect(first?.periodIds).toHaveLength(1);
    expect(second).toMatchObject({ name: '7º ano A', shiftId: null, version: 1 });
  });

  it('não grava nenhuma linha quando alguma tem erro', async () => {
    const content = 'Professor;Disciplinas\nAna Exemplo;Matemática\nOtávio Modelo;Química';

    expect((await preview({ kind: 'teachers', content })).summary).toMatchObject({
      create: 1,
      invalid: 1,
    });
    await expect(confirmed('teachers', content)).rejects.toThrow(CatalogImportInvalidError);
    await expect(confirmed('teachers', 'Nome;X\nAna;1')).rejects.toThrow(CatalogImportInvalidError);
    expect(await teachers.listAll()).toEqual([]);
  });

  it('recusa a confirmação se o resultado de alguma linha mudou depois da prévia', async () => {
    const content = 'Disciplina\nArte\nCiências';
    const { digest } = await preview({ kind: 'subjects', content });
    await subjects.add(subject('art', 'Arte'));

    await expect(importCatalog({ kind: 'subjects', content, digest })).rejects.toThrow(
      CatalogImportStaleError,
    );
    // Outro arquivo não aproveita o resumo de uma prévia anterior.
    await expect(
      importCatalog({ kind: 'subjects', content: 'Disciplina\nCiências', digest }),
    ).rejects.toThrow(CatalogImportStaleError);
    expect((await subjects.listAll()).map((s) => s.name).toSorted()).toEqual([
      'Arte',
      'Matemática',
    ]);
  });

  it('alterações em outros cadastros depois da prévia não impedem a confirmação', async () => {
    const content = 'Disciplina\nCiências';
    const { digest } = await preview({ kind: 'subjects', content });
    await subjects.add(subject('art', 'Arte'));

    expect(await importCatalog({ kind: 'subjects', content, digest })).toMatchObject({
      created: 1,
    });
  });

  it('recusa a confirmação quando não há nada novo', async () => {
    await expect(confirmed('subjects', 'Disciplina\nmatemática')).rejects.toThrow(
      CatalogImportEmptyError,
    );
  });

  it('reimportar as mesmas atribuições não duplica a carga', async () => {
    await confirmed(
      'teachers',
      'Professor;Disciplinas\nAna Exemplo;Matemática\nOtávio Modelo;Matemática',
    );
    await confirmed('classGroups', 'Turma\n6º ano A');
    const content = [
      'Turma;Disciplina;Professor;Aulas por semana;Bloco',
      '6º ano A;Matemática;Ana Exemplo;3;;',
      '6º ano A;Matemática;Ana Exemplo;3;R;',
      '6º ano A;Matemática;Otávio Modelo;3;R;',
    ].join('\n');

    expect(await confirmed('assignments', content)).toEqual({
      kind: 'assignments',
      created: 3,
      existing: 0,
    });
    expect((await assignments.listAll()).map((a) => a.participants.length).toSorted()).toEqual([
      1, 2,
    ]);
    expect((await preview({ kind: 'assignments', content })).summary).toMatchObject({
      create: 0,
      existing: 3,
    });
  });

  it('entrega o modelo CSV de cada tipo de cadastro', () => {
    const template = new GetCatalogImportTemplate().execute({ kind: 'teachers' });

    expect(template.fileName).toBe('modelo-professores.csv');
    expect(template.content.charCodeAt(0)).toBe(0xfeff);
    expect(template.content.slice(1)).toMatch(
      /^Professor;Disciplinas;Carga máxima;Hora-atividade\r\n/,
    );
  });
});
