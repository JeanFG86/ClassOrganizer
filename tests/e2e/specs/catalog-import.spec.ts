import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  assignmentListSchema,
  classGroupListSchema,
  subjectListSchema,
  teacherListSchema,
} from '@classorganizer/contracts';

async function chooseFile(page: Page, name: string, content: string | Buffer) {
  await page.getByLabel('Arquivo CSV').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: typeof content === 'string' ? Buffer.from(content, 'utf8') : content,
  });
  await expect(page.getByRole('heading', { name: `Prévia de ${name}` })).toBeVisible();
}

async function importShown(page: Page, rows: number, label: string) {
  await page
    .getByRole('button', { name: `Importar ${rows} ${rows === 1 ? 'linha' : 'linhas'}` })
    .click();
  await expect(page.getByText(`Importação de ${label} concluída`)).toBeVisible();
}

test('importar disciplinas, turmas, professores e atribuições por CSV com prévia', async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const subjectA = `Geografia CSV ${suffix}`;
  const subjectB = `Arte CSV ${suffix}`;
  const shiftName = `Turno CSV ${suffix}`;
  const groupName = `Turma CSV ${suffix}`;
  const teacherA = `Docente Açaí ${suffix}`;
  const teacherB = `Docente parceiro ${suffix}`;
  const shift = await request.post('/api/v1/shifts', {
    data: {
      name: shiftName,
      periods: [
        { start: '07:00', end: '07:50' },
        { start: '07:50', end: '08:40' },
        { start: '08:40', end: '09:30' },
      ],
    },
  });
  expect(shift.status(), await shift.text()).toBe(201);

  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Importar CSV' })
    .click();
  await expect(page.getByRole('heading', { name: 'Importar cadastros (CSV)' })).toBeVisible();

  // Modelo em UTF-8 com BOM, que o Excel abre com acentos.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar modelo de disciplinas' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('modelo-disciplinas.csv');
  const template = await readFile(await download.path());
  expect(template.toString('utf8')).toMatch(/^\uFEFFDisciplina\r\n/);

  // Com uma linha errada, a prévia mostra o erro e não oferece a importação.
  await chooseFile(page, 'disciplinas.csv', `Disciplina\n${subjectA}\n${subjectA.toUpperCase()}`);
  const preview = page.getByRole('region', { name: 'Prévia de disciplinas.csv' });
  await expect(preview.getByRole('row').nth(2)).toContainText('Repete a disciplina da linha 2.');
  await expect(page.getByRole('button', { name: /^Importar \d/ })).toHaveCount(0);

  await chooseFile(page, 'disciplinas.csv', `Disciplina\n${subjectA}\n${subjectB}`);
  await importShown(page, 2, 'disciplinas');

  await page.getByLabel('O que importar').selectOption({ label: 'Turmas' });
  await chooseFile(page, 'turmas.csv', `Turma;Turno;Aulas do turno\n${groupName};${shiftName};2`);
  await importShown(page, 1, 'turmas');

  // Arquivo salvo em Windows-1252, como em versões antigas do Excel.
  await page.getByLabel('O que importar').selectOption({ label: 'Professores' });
  await chooseFile(
    page,
    'professores.csv',
    Buffer.from(
      `Professor;Disciplinas;Carga máxima;Hora-atividade\r\n` +
        `${teacherA};${subjectA}|${subjectB};20;2\r\n${teacherB};${subjectB};;\r\n`,
      'latin1',
    ),
  );
  await expect(page.getByText(teacherA, { exact: true })).toBeVisible();
  await importShown(page, 2, 'professores');

  await page.getByLabel('O que importar').selectOption({ label: 'Atribuições' });
  const assignments =
    'Turma;Disciplina;Professor;Aulas por semana;Bloco\n' +
    `${groupName};${subjectA};${teacherA};3;\n` +
    `${groupName};${subjectB};${teacherA};2;Dupla\n` +
    `${groupName};${subjectB};${teacherB};2;Dupla\n`;
  await chooseFile(page, 'atribuicoes.csv', assignments);

  // A prévia com tabela larga rola dentro do card, sem rolar a página no celular.
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await importShown(page, 3, 'atribuições');

  // Reimportar o mesmo arquivo não duplica a carga.
  await chooseFile(page, 'atribuicoes.csv', assignments);
  await expect(page.getByText('Todas as linhas já estão cadastradas')).toBeVisible();

  const subjects = subjectListSchema.parse(await (await request.get('/api/v1/subjects')).json());
  const ids = new Map(subjects.items.map((s) => [s.name, s.id]));
  expect(ids.has(subjectA) && ids.has(subjectB)).toBe(true);
  const groups = classGroupListSchema.parse(
    await (await request.get('/api/v1/class-groups')).json(),
  );
  const group = groups.items.find((g) => g.name === groupName);
  expect(group?.periodIds).toHaveLength(2);
  const teachers = teacherListSchema.parse(await (await request.get('/api/v1/teachers')).json());
  expect(teachers.items.find((t) => t.name === teacherA)).toMatchObject({
    maxWeeklyLessons: 20,
    planningPeriods: 2,
  });
  const blocks = assignmentListSchema
    .parse(await (await request.get('/api/v1/assignments')).json())
    .items.filter((block) => block.classGroupId === group?.id);
  expect(blocks.map((block) => block.participants.length).toSorted()).toEqual([1, 2]);
});
