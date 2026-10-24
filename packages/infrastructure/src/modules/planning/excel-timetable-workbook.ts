import ExcelJS from 'exceljs';
import {
  PlanningError,
  type TimetableExport,
  type TimetableWorkbookWriter,
} from '@classorganizer/core/planning';

type Value = string | number | null;
type Column = { title: string; width: number; format?: 'time' | 'integer' };
const navy = '17365D';
const pale = 'EEF3F8';
const white = 'FFFFFF';
const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

/** Valores textuais são sempre strings do XLSX, nunca fórmulas, hyperlinks ou expressões. */
export class ExcelTimetableWorkbook implements TimetableWorkbookWriter {
  async write(data: TimetableExport): Promise<Uint8Array> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EntreAulas';
    workbook.created = data.generatedAt;
    workbook.modified = data.generatedAt;
    workbook.title = `Grade semanal - revisão ${data.revision.number}`;
    const revision = `Revisão ${data.revision.number}${data.revision.name ? ' - ' + data.revision.name : ''} | ${data.revision.sealedAt ? 'Concluída' : 'RASCUNHO'}${data.historical ? ' | Histórica' : ''}${data.archived ? ' | Planejamento arquivado' : ''}`;
    const metadata = `${data.planning.name} | ${data.planning.year} | ${revision} | Planejamento v${data.planning.version}`;
    const stamp = `Base ${data.capturedAt} | Catálogo ${data.catalogVersion} | Exportado em ${data.generatedAt.toISOString()} (UTC)`;

    function styleRow(row: ExcelJS.Row, widths: readonly number[]) {
      let lines = 1;
      row.eachCell((cell, index) => {
        cell.font = { name: 'Arial', size: 11, color: { argb: '17212E' } };
        cell.alignment = {
          vertical: 'top',
          wrapText: true,
          indent: 1,
          horizontal: typeof cell.value === 'number' ? 'right' : 'left',
        };
        if (typeof cell.value === 'string') {
          if (cell.value.length > 32_767)
            throw new PlanningError(
              'planning.workbook_too_large',
              'Um texto desta revisão ultrapassa o limite de uma célula XLSX.',
              'validation',
            );
          cell.numFmt = '@';
          lines = Math.max(
            lines,
            cell.value
              .split('\n')
              .reduce(
                (count, line) =>
                  count +
                  Math.max(1, Math.ceil(line.length / Math.max(1, (widths[index - 1] ?? 25) - 2))),
                0,
              ),
          );
        }
        cell.border = { bottom: { style: 'hair', color: { argb: 'D7DEE8' } } };
      });
      row.height = Math.max(22, Math.min(409, lines * 15 + 8));
    }
    function table(name: string, columns: Column[], rows: Value[][], note: string) {
      if (rows.length > 1_048_570)
        throw new PlanningError(
          'planning.workbook_too_large',
          'A quantidade de linhas ultrapassa o limite do formato XLSX.',
          'validation',
        );
      const sheet = workbook.addWorksheet(name, {
        views: [{ state: 'frozen', ySplit: 6, xSplit: 1, showGridLines: false }],
        pageSetup: { orientation: 'landscape', paperSize: 9, scale: 100 },
      });
      sheet.columns = columns.map((c) => ({ width: c.width }));
      for (const [number, text] of [
        [1, name],
        [2, metadata],
        [3, stamp],
        [4, note],
      ] as const) {
        sheet.mergeCells(number, 1, number, columns.length);
        const cell = sheet.getCell(number, 1);
        cell.value = text;
        cell.font = {
          name: 'Arial',
          size: number === 1 ? 14 : 11,
          bold: number === 1 || number === 2,
          color: { argb: '17212E' },
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: number === 1 ? white : pale },
        };
        cell.alignment = { wrapText: true, vertical: 'middle', indent: 1 };
        sheet.getRow(number).height =
          number === 1 ? 30 : Math.max(25, Math.ceil(text.length / 110) * 16 + 6);
      }
      const header = sheet.getRow(6);
      header.values = columns.map((c) => c.title);
      header.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
        cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'left', indent: 1 };
      });
      header.height = 42;
      for (const values of rows) {
        const row = sheet.addRow(values.map((value) => (value === '' ? null : value)));
        styleRow(
          row,
          columns.map((c) => c.width),
        );
        row.eachCell((cell, index) => {
          if (typeof cell.value === 'number')
            cell.numFmt = columns[index - 1]?.format === 'time' ? 'hh:mm' : '#,##0';
          if (row.number % 2 === 1)
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F5F8FC' } };
        });
      }
      sheet.autoFilter = {
        from: { row: 6, column: 1 },
        to: { row: Math.max(6, sheet.rowCount), column: columns.length },
      };
      sheet.pageSetup.printTitlesRow = '1:6';
      sheet.headerFooter.oddFooter =
        '&LEntreAulas - Revisão ' + data.revision.number + '&RPágina &P de &N';
      return sheet;
    }
    const identity = table(
      'Revisão',
      [
        { title: 'Identificação', width: 36 },
        { title: 'Valor', width: 100 },
      ],
      [
        ['Planejamento', data.planning.name],
        ['Ano', data.planning.year],
        ['Identificador do planejamento', data.planning.id],
        ['Revisão', data.revision.number],
        ['Nome da revisão', data.revision.name],
        ['Identificador da revisão', data.revision.id],
        ['Situação', data.revision.sealedAt ? 'Concluída' : 'RASCUNHO - não concluída'],
        ['Histórica', data.historical ? 'Sim' : 'Não'],
        ['Planejamento arquivado', data.archived ? 'Sim' : 'Não'],
        ['Versão do planejamento', data.planning.version],
        ['Catálogo', data.catalogVersion],
        ['Base capturada (UTC)', new Date(data.capturedAt).toISOString()],
        ['Gerado em (UTC)', data.generatedAt.toISOString()],
        ['Alocações', data.schedules.length],
        ['Professores ativos', data.teachers.length],
        ['Turmas ativas', data.classGroups.length],
        ['Blocos cadastrados', data.assignments.length],
        ...data.notices.map((notice, index): Value[] => [
          'Pendência ou aviso ' + (index + 1),
          notice,
        ]),
      ],
      'Fotografia para consulta. O banco continua sendo a fonte oficial. Alterar este arquivo não altera o planejamento.',
    );
    identity.getCell('B8').numFmt = '0';
    table(
      'Horários',
      [
        { title: 'Tipo', width: 18 },
        { title: 'Dia', width: 14 },
        { title: 'Turno', width: 24 },
        { title: 'Início', width: 12, format: 'time' },
        { title: 'Fim', width: 12, format: 'time' },
        { title: 'Turma', width: 25 },
        { title: 'Disciplinas', width: 35 },
        { title: 'Professores', width: 38 },
        { title: 'Recursos', width: 28 },
        { title: 'Fixada', width: 12 },
      ],
      data.schedules.map((s) => [
        s.kind === 'lesson' ? 'Aula' : 'Hora-atividade',
        days[s.weekday - 1] ?? 'Dia desconhecido',
        s.shift,
        s.startMinute === null ? null : s.startMinute / 1440,
        s.endMinute === null ? null : s.endMinute / 1440,
        s.classGroup,
        s.subjects.join('\n'),
        s.teachers.join('\n'),
        s.resources.join('\n'),
        s.pinned ? 'Sim' : 'Não',
      ]),
      'Uma linha por bloco alocado ou hora-atividade. Aulas compartilhadas aparecem uma vez, com todos os participantes. Horários usam a hora local da grade.',
    );
    table(
      'Professores',
      [
        { title: 'Professor', width: 38 },
        { title: 'Aulas cadastradas', width: 20 },
        { title: 'Aulas exigidas\nna grade', width: 22 },
        { title: 'Aulas alocadas', width: 18 },
        { title: 'HA exigidas', width: 18 },
        { title: 'HA alocadas', width: 18 },
        { title: 'Carga máxima\nde aulas', width: 22 },
      ],
      data.teachers.map((t) => [
        t.name,
        t.assigned,
        t.required,
        t.placed,
        t.requiredPlanning,
        t.placedPlanning,
        t.maxWeeklyLessons,
      ]),
      'Cargas em unidades de aula, mesmo com durações diferentes. Cadastradas inclui os blocos do cadastro; exigidas considera a grade aplicável. Carga máxima vazia significa não informada.',
    );
    table(
      'Turmas',
      [
        { title: 'Turma', width: 32 },
        { title: 'Horários\nconfigurados', width: 24 },
        { title: 'Aulas cadastradas', width: 22 },
        { title: 'Aulas exigidas\nna grade', width: 24 },
        { title: 'Aulas alocadas', width: 22 },
      ],
      data.classGroups.map((c) => [
        c.name,
        c.configured ? 'Sim' : 'Não',
        c.assigned,
        c.required,
        c.placed,
      ]),
      'Cada bloco conta uma vez para a turma, independentemente do número de professores ou disciplinas.',
    );
    table(
      'Blocos',
      [
        { title: 'Identificador do bloco', width: 39 },
        { title: 'Turma', width: 26 },
        { title: 'Disciplina / professor', width: 65 },
        { title: 'Aulas por semana', width: 20 },
        { title: 'Alocações', width: 18 },
        { title: 'Situação', width: 24 },
      ],
      data.assignments.map((a) => [
        a.id,
        a.classGroup,
        a.participants.join('\n'),
        a.weeklyLessons,
        a.placed,
        a.applicable ? 'Aplicável à grade' : 'Fora da grade',
      ]),
      'Todos os blocos da fotografia. Fora da grade indica cadastro arquivado ou configuração/referência que não entra na modelagem desta revisão.',
    );
    return new Uint8Array(await workbook.xlsx.writeBuffer());
  }
}
