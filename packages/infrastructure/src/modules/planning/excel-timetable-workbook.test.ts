import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  buildTimetableExport,
  translateCatalog,
  PlanningEntity,
  PlanningRevisionEntity,
  DEFAULT_GRID_RULES,
} from '@classorganizer/core/planning';
import { completeGrid, makeCatalogFixture } from '@classorganizer/core/testing';
import { ExcelTimetableWorkbook } from './excel-timetable-workbook.ts';
const now = new Date('2026-01-01T00:00:00Z');
function fixture() {
  const planning = PlanningEntity.create({
    id: 'plan',
    name: 'Plano inventado',
    year: 2027,
    createdAt: now,
    copiedFromId: null,
  }).snapshot();
  const revision = PlanningRevisionEntity.open({
    id: 'revision',
    planningId: planning.id,
    number: 1,
    snapshot: makeCatalogFixture(),
    gridRules: DEFAULT_GRID_RULES,
    createdBy: 'editor',
    createdAt: now,
  }).snapshot();
  return buildTimetableExport({
    planning,
    revision,
    translated: translateCatalog(revision.snapshot, revision.gridRules, revision.id),
    placements: completeGrid(),
    historical: true,
    generatedAt: now,
  });
}
describe('adaptador XLSX da grade', () => {
  it('recusa texto além do limite do formato sem truncar silenciosamente', async () => {
    const data = fixture();
    data.notices = ['x'.repeat(32_768)];
    await expect(new ExcelTimetableWorkbook().write(data)).rejects.toMatchObject({
      code: 'planning.workbook_too_large',
    });
  });
  it('reabre o arquivo com identificação, cargas numéricas, horas e filtros', async () => {
    const data = fixture();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(await new ExcelTimetableWorkbook().write(data)).buffer);
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      'Revisão',
      'Horários',
      'Professores',
      'Turmas',
      'Blocos',
    ]);
    const schedules = workbook.getWorksheet('Horários');
    expect(schedules?.getCell('D7').value).toEqual(new Date('1899-12-30T07:00:00Z'));
    expect(schedules?.getCell('D7').numFmt).toBe('hh:mm');
    expect(schedules?.getCell('B2').value ?? schedules?.getCell('A2').value).toContain('Histórica');
    expect(schedules?.rowCount).toBe(12);
    expect(schedules?.getRow(8).height).toBeGreaterThanOrEqual(38);
    expect(schedules?.getCell('I7').value).toBeNull();
    expect(workbook.getWorksheet('Revisão')?.getCell('B8').numFmt).toBe('0');
    expect(schedules?.autoFilter).toBeDefined();
    expect(schedules?.views[0]).toMatchObject({ state: 'frozen', ySplit: 6 });
    const classes = workbook.getWorksheet('Turmas');
    expect(classes?.getCell('C7').value).toBe(4);
    expect(classes?.getCell('E7').value).toBe(4);
    expect(workbook.getWorksheet('Professores')?.getCell('G7').value).toBeNull();
  });
  it('armazena textos perigosos literalmente e não cria fórmulas nem links', async () => {
    const data = fixture();
    data.planning.name = '=HYPERLINK("https://invalid.example","teste")';
    data.teachers[0] = {
      ...data.teachers[0],
      name: '+SUM(1,2)',
      assigned: 5,
      required: 5,
      placed: 5,
      requiredPlanning: 1,
      placedPlanning: 1,
      maxWeeklyLessons: null,
    };
    if (data.schedules[0]) {
      data.schedules[0].subjects = ['@SUM(1,2)'];
      data.schedules[0].teachers = ['-2+3'];
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(await new ExcelTimetableWorkbook().write(data)).buffer);
    expect(workbook.getWorksheet('Revisão')?.getCell('B7').value).toBe(data.planning.name);
    expect(workbook.getWorksheet('Professores')?.getCell('A7').value).toBe('+SUM(1,2)');
    expect(workbook.getWorksheet('Horários')?.getCell('G7').value).toBe('@SUM(1,2)');
    for (const sheet of workbook.worksheets)
      sheet.eachRow((row) =>
        row.eachCell((cell) => {
          expect(cell.formula).toBeUndefined();
          expect(cell.hyperlink).toBeUndefined();
        }),
      );
  });
  it('preserva um arquivo vazio com cabeçalhos e situação de rascunho', async () => {
    const data = fixture();
    data.schedules = [];
    data.teachers = [];
    data.classGroups = [];
    data.assignments = [];
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(await new ExcelTimetableWorkbook().write(data)).buffer);
    expect(workbook.getWorksheet('Horários')?.rowCount).toBe(6);
    expect(workbook.getWorksheet('Horários')?.getCell('A2').value).toContain('RASCUNHO');
  });
});
