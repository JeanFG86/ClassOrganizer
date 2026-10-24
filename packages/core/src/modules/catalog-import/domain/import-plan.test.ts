import { describe, expect, it } from 'vitest';
import {
  ClassGroupEntity,
  ResourceEntity,
  ShiftEntity,
  SubjectEntity,
} from '../../school-structure/domain/index.ts';
import { TeacherEntity, TeachingAssignmentEntity } from '../../teaching/domain/index.ts';
import {
  importIsValid,
  planCatalogImport,
  summarizeImport,
  type CatalogImportState,
} from './import-plan.ts';
import type { CatalogImportKind } from './layouts.ts';

const now = new Date('2026-02-01T12:00:00Z');

function sequence(prefix: string) {
  let next = 0;
  return { next: () => `${prefix}-${++next}` };
}

/** Cadastros inventados: Manhã com 6 aulas, 6º ano A no turno e uma professora. */
function state(): CatalogImportState {
  const periods = Array.from({ length: 6 }, (_, i) => ({
    startMinute: 420 + i * 50,
    endMinute: 470 + i * 50,
  }));
  const morning = ShiftEntity.create(
    { id: 'morning', name: 'Manhã', periods, createdAt: now },
    sequence('p'),
  ).snapshot();
  const evening = ShiftEntity.create(
    { id: 'evening', name: 'Noite', periods: periods.slice(0, 4), createdAt: now },
    sequence('n'),
  )
    .archive(now)
    .snapshot();
  const math = SubjectEntity.create({ id: 'math', name: 'Matemática', createdAt: now }).snapshot();
  const art = SubjectEntity.create({ id: 'art', name: 'Arte', createdAt: now }).snapshot();
  const latin = SubjectEntity.create({ id: 'latin', name: 'Latim', createdAt: now })
    .archive(now)
    .snapshot();
  const sixth = ClassGroupEntity.create({ id: '6a', name: '6º ano A', createdAt: now })
    .schedule(
      morning,
      morning.periods.slice(0, 5).map((p) => p.id),
    )
    .snapshot();
  const old = ClassGroupEntity.create({ id: 'old', name: '9º ano Z', createdAt: now })
    .archive(now)
    .snapshot();
  const ana = TeacherEntity.create({
    id: 'ana',
    name: 'Ana Exemplo',
    subjectIds: ['math', 'art'],
    createdAt: now,
    maxWeeklyLessons: 20,
  }).snapshot();
  const otavio = TeacherEntity.create({
    id: 'otavio',
    name: 'Otávio Modelo',
    subjectIds: ['art'],
    createdAt: now,
  }).snapshot();
  const homonym = TeacherEntity.create({
    id: 'homonym-1',
    name: 'Davi Repetido',
    subjectIds: ['math'],
    createdAt: now,
  }).snapshot();
  const homonym2 = { ...homonym, id: 'homonym-2' };
  const retired = TeacherEntity.create({
    id: 'retired',
    name: 'Eva Antiga',
    subjectIds: ['math'],
    createdAt: now,
  })
    .archive(now)
    .snapshot();
  const lab = ResourceEntity.create({ id: 'lab', name: 'Laboratório', createdAt: now }).snapshot();
  const existing = TeachingAssignmentEntity.create({
    id: 'existing',
    classGroupId: '6a',
    participants: [{ teacherId: 'ana', subjectId: 'math' }],
    weeklyLessons: 5,
    resourceIds: [],
    createdAt: now,
  }).snapshot();
  return {
    subjects: [math, art, latin],
    classGroups: [sixth, old],
    shifts: [morning, evening],
    resources: [lab],
    teachers: [ana, otavio, homonym, homonym2, retired],
    assignments: [existing],
  };
}

function plan(kind: CatalogImportKind, content: string, current = state()) {
  return planCatalogImport({ kind, content, state: current, now, nextId: sequence('new').next });
}

function errors(result: ReturnType<typeof plan>) {
  return result.rows.map((row) =>
    row.messages.filter((m) => m.severity === 'error').map((m) => m.text),
  );
}

describe('plano de importação: arquivo e cabeçalho', () => {
  it('aponta colunas desconhecidas, repetidas e obrigatórias ausentes sem ler as linhas', () => {
    const result = plan('teachers', 'Nome;Disciplinas;Disciplinas;Apelido\nAna;Arte;Arte;A');

    expect(result.rows).toEqual([]);
    expect(result.fileErrors).toEqual([
      'A coluna "Disciplinas" aparece mais de uma vez.',
      'A coluna "Apelido" não faz parte do modelo de professores.',
      'Use as colunas do modelo: Professor, Disciplinas, Carga máxima, Hora-atividade.',
    ]);
    expect(plan('assignments', 'Turma;Disciplina\nx;y').fileErrors).toContain(
      'Falta a coluna "Professor".',
    );
    expect(importIsValid(result)).toBe(false);
  });

  it('aceita títulos sem acento, com sublinhado e em outra ordem', () => {
    const result = plan('teachers', 'HORA_ATIVIDADE;carga-maxima;professor\n2;18;Fábio Novo');

    expect(result.fileErrors).toEqual([]);
    expect(result.columns).toEqual(['Professor', 'Carga máxima', 'Hora-atividade']);
    expect(result.rows[0]).toMatchObject({ cells: ['Fábio Novo', '18', '2'], status: 'create' });
    expect(result.writes).toMatchObject([
      {
        type: 'teacher',
        teacher: { name: 'Fábio Novo', maxWeeklyLessons: 18, planningPeriods: 2 },
      },
    ]);
  });

  it('informa o arquivo sem linhas e o CSV malformado', () => {
    expect(plan('subjects', 'Disciplina\n').fileErrors).toEqual([
      'O arquivo tem apenas o cabeçalho. Preencha uma linha por item.',
    ]);
    expect(plan('subjects', 'Disciplina\n"Arte').fileErrors[0]).toMatch(/aspas sem fechamento/);
  });

  it('recusa valores fora das colunas do cabeçalho', () => {
    const result = plan('subjects', 'Disciplina;\nFísica;sobra\nQuímica;');

    expect(errors(result)).toEqual([['A linha tem valores fora das colunas do cabeçalho.'], []]);
    expect(result.writes).toEqual([]);
  });
});

describe('plano de importação: disciplinas', () => {
  it('separa novas, existentes, arquivadas, repetidas e inválidas', () => {
    const result = plan(
      'subjects',
      ['Disciplina', 'Física', ' matematica ', 'Latim', 'FÍSICA', '', 'x'.repeat(81)].join('\n'),
    );

    expect(result.rows.map((row) => [row.line, row.status])).toEqual([
      [2, 'create'],
      [3, 'existing'],
      [4, 'invalid'],
      [5, 'invalid'],
      [7, 'invalid'],
    ]);
    expect(errors(result)).toEqual([
      [],
      [],
      ['Já existe uma disciplina arquivada chamada "Latim". Restaure-a na lista de arquivadas.'],
      ['Repete a disciplina da linha 2.'],
      ['O nome da disciplina deve ter no máximo 80 caracteres.'],
    ]);
    expect(summarizeImport(result)).toEqual({ total: 5, create: 1, existing: 1, invalid: 3 });
    // Com qualquer linha inválida, nada é planejado para gravação.
    expect(result.writes).toEqual([]);
  });

  it('planeja as disciplinas novas quando todas as linhas são válidas', () => {
    const result = plan('subjects', 'Disciplina\nFísica\nMatemática\nQuímica');

    expect(importIsValid(result)).toBe(true);
    expect(result.writes.map((w) => (w.type === 'subject' ? w.subject.name : ''))).toEqual([
      'Física',
      'Química',
    ]);
  });
});

describe('plano de importação: turmas', () => {
  it('cria turmas com as primeiras aulas do turno ou todas elas', () => {
    const result = plan(
      'classGroups',
      'Turma;Turno;Aulas do turno\n7º A;manha;4\n8º A;Manhã;\n9º A;;',
    );

    expect(errors(result)).toEqual([[], [], []]);
    expect(result.writes).toMatchObject([
      {
        type: 'classGroup',
        classGroup: { name: '7º A', shiftId: null },
        schedule: { shiftId: 'morning', periodIds: ['p-1', 'p-2', 'p-3', 'p-4'] },
      },
      {
        type: 'classGroup',
        schedule: { periodIds: ['p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'p-6'] },
      },
      { type: 'classGroup', classGroup: { name: '9º A' }, schedule: null },
    ]);
  });

  it('valida turno, quantidade de aulas e turmas já cadastradas', () => {
    const result = plan(
      'classGroups',
      [
        'Turma;Turno;Aulas',
        '7º A;Tarde;',
        '7º B;Manhã;7',
        '7º C;Manhã;três',
        '7º D;;3',
        '7º E;Noite;',
        '9º ano Z;;',
        '6º ano A;Manhã;6',
        '6º ano A;Manhã;5',
      ].join('\n'),
    );

    expect(errors(result)).toEqual([
      ['O turno "Tarde" não está cadastrado. Cadastre-o na tela de turnos.'],
      ['O turno "Manhã" tem 6 aulas; informe de 1 a 6.'],
      ['Informe em "Aulas do turno" um número inteiro.'],
      ['Informe o turno para indicar as aulas da turma.'],
      ['O turno "Noite" está arquivado.'],
      ['Já existe uma turma arquivada chamada "9º ano Z". Restaure-a na lista de arquivadas.'],
      [],
      ['Repete a turma da linha 8.'],
    ]);
    expect(result.rows[6]).toMatchObject({
      status: 'existing',
      messages: [{ severity: 'warning', text: expect.stringMatching(/não será alterada/) }],
    });
  });
});

describe('plano de importação: professores', () => {
  it('liga disciplinas pelo nome e valida carga e hora-atividade', () => {
    const result = plan(
      'teachers',
      [
        'Professor;Disciplinas;Carga máxima;Hora-atividade',
        'Gil Novo;matemática | Arte;;',
        'Hugo Novo;Química;10;1',
        'Iara Nova;Matemática, Arte;;',
        'Júlia Nova;Latim;;',
        'Lia Nova;;cinco;-1',
        'Mia Nova;;61;41',
      ].join('\n'),
    );

    expect(errors(result)).toEqual([
      [],
      ['A disciplina "Química" não está cadastrada.'],
      ['A disciplina "Matemática, Arte" não está cadastrada. Separe várias disciplinas com "|".'],
      ['A disciplina "Latim" está arquivada.'],
      [
        'A carga máxima deve ser um número inteiro de aulas por semana.',
        'A hora-atividade deve ser um número inteiro de aulas por semana.',
      ],
      ['A carga máxima deve ser um número inteiro de 1 a 60 aulas por semana.'],
    ]);
  });

  it('mantém professores existentes e avisa quando os dados do arquivo diferem', () => {
    const result = plan(
      'teachers',
      [
        'Professor;Disciplinas;Carga máxima',
        'ana exemplo;Arte|Matemática;20',
        'Otávio Modelo;Matemática;',
        'Davi Repetido;Matemática;',
        'Eva Antiga;;',
        'Ana Exemplo;;',
      ].join('\n'),
    );

    expect(result.rows.map((row) => row.status)).toEqual([
      'existing',
      'existing',
      'existing',
      'invalid',
      'invalid',
    ]);
    expect(result.rows[0]?.messages).toEqual([]);
    expect(result.rows[1]?.messages[0]?.text).toMatch(/não será alterado/);
    expect(errors(result)[3]?.[0]).toMatch(/professor arquivado/);
    expect(errors(result)[4]).toEqual(['Repete o professor da linha 2.']);
  });
});

describe('plano de importação: atribuições', () => {
  const header = 'Turma;Disciplina;Professor;Aulas por semana;Bloco;Recursos';

  it('cria blocos simples e compartilhados com recursos', () => {
    const result = plan(
      'assignments',
      [
        header,
        '6º ano A;Arte;Otávio Modelo;2;dupla;Laboratório',
        '6º ano A;Arte;Ana Exemplo;2;DUPLA;',
        '6º ano A;Arte;Otávio Modelo;1;;',
      ].join('\n'),
    );

    expect(errors(result)).toEqual([[], [], []]);
    expect(result.writes).toMatchObject([
      {
        type: 'assignment',
        assignment: {
          classGroupId: '6a',
          participants: [
            { teacherId: 'otavio', subjectId: 'art' },
            { teacherId: 'ana', subjectId: 'art' },
          ],
          weeklyLessons: 2,
          resourceIds: ['lab'],
        },
      },
      {
        type: 'assignment',
        assignment: { weeklyLessons: 1, participants: [{ teacherId: 'otavio' }] },
      },
    ]);
    expect(result.rows[2]?.messages).toEqual([
      {
        severity: 'warning',
        text: 'A linha 2 também atribui "Arte" a "Otávio Modelo" nesta turma; serão blocos separados.',
      },
    ]);
  });

  it('mantém blocos idênticos já cadastrados e avisa quando a carga será somada', () => {
    const result = plan(
      'assignments',
      [header, '6º ano A;Matemática;Ana Exemplo;5;;', '6º ano A;Matemática;Ana Exemplo;1;;'].join(
        '\n',
      ),
    );

    expect(result.rows.map((row) => row.status)).toEqual(['existing', 'create']);
    expect(result.rows[1]?.messages[0]?.text).toBe(
      'A turma já tem aulas de "Matemática" com "Ana Exemplo"; este bloco será somado à carga atual.',
    );
    expect(result.writes).toHaveLength(1);
  });

  it('aponta referências ausentes, arquivadas, ambíguas e sem habilitação', () => {
    const result = plan(
      'assignments',
      [
        header,
        '7º Z;Matemática;Ana Exemplo;2;;',
        '9º ano Z;Latim;Eva Antiga;2;;',
        '6º ano A;Matemática;Davi Repetido;2;;',
        '6º ano A;Matemática;Otávio Modelo;0;;',
        ';;;;;Piscina',
      ].join('\n'),
    );

    expect(errors(result)).toEqual([
      ['A turma "7º Z" não está cadastrada.'],
      [
        'A turma "9º ano Z" está arquivada.',
        'A disciplina "Latim" está arquivada.',
        'O professor "Eva Antiga" está arquivado.',
      ],
      [
        'Há 2 cadastros ativos chamados "Davi Repetido". Registre esta atribuição na tela de atribuições.',
      ],
      [
        'O professor "Otávio Modelo" não está habilitado em "Matemática". Habilite-o na tela de professores ou corrija a linha.',
        'Informe um número inteiro de aulas por semana entre 1 e 40.',
      ],
      [
        'Informe a turma.',
        'Informe a disciplina.',
        'Informe o professor.',
        'Informe as aulas por semana.',
        'O recurso "Piscina" não está cadastrado.',
      ],
    ]);
  });

  it('invalida o bloco inteiro quando uma linha dele tem erro ou cargas diferentes', () => {
    const result = plan(
      'assignments',
      [
        header,
        '6º ano A;Arte;Otávio Modelo;2;B1;',
        '6º ano A;Arte;Ana Exemplo;3;B1;',
        '6º ano A;Arte;Ana Exemplo;2;B2;',
        '6º ano A;Química;Otávio Modelo;2;B2;',
        '6º ano A;Arte;Ana Exemplo;2;B3;',
        '6º ano A;Matemática;Ana Exemplo;2;B3;',
      ].join('\n'),
    );

    expect(errors(result)).toEqual([
      ['As linhas do bloco "B1" informam aulas por semana diferentes.'],
      ['As linhas do bloco "B1" informam aulas por semana diferentes.'],
      ['O bloco "B2" tem erro na linha 5.'],
      ['A disciplina "Química" não está cadastrada.'],
      ['Inclua pelo menos um professor e não repita o mesmo professor no bloco.'],
      ['Inclua pelo menos um professor e não repita o mesmo professor no bloco.'],
    ]);
    expect(result.writes).toEqual([]);
  });
});
