import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const ITEMS = [
  'Disciplinas, turnos e turmas',
  'Professores e habilitações',
  'Atribuições, cargas e recursos',
  'Disponibilidade e hora-atividade',
  'Regras da grade',
];

test('ano seguinte: cópia com os cadastros atuais, alterações no checklist e conferência por item, inclusive no celular', async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const name = 'Ano fictício ' + suffix;
  const subject = await request.post('/api/v1/subjects', {
    data: { name: 'Disciplina anual ' + suffix },
  });
  expect(subject.status()).toBe(201);
  const subjectId = ((await subject.json()) as { id: string }).id;
  const first = await request.post('/api/v1/teachers', {
    data: { name: 'Docente Antigo ' + suffix, subjectIds: [subjectId] },
  });
  expect(first.status()).toBe(201);
  expect((await request.post('/api/v1/plannings', { data: { name, year: 2027 } })).status()).toBe(
    201,
  );
  // Depois do planejamento de origem, a secretaria cadastra quem chega no ano seguinte.
  expect(
    (
      await request.post('/api/v1/teachers', {
        data: { name: 'Docente Novo ' + suffix, subjectIds: [subjectId], planningPeriods: 2 },
      })
    ).status(),
  ).toBe(201);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/planejamentos');
  await page.getByRole('button', { name: 'Copiar ' + name, exact: true }).click();
  await expect(
    page.getByRole('radio', { name: 'Cadastros atuais, para preparar o próximo período' }),
  ).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Trazer a grade da origem como ponto de partida' }),
  ).toBeChecked();
  await page.getByLabel('Nome do planejamento', { exact: true }).fill(name + ' seguinte');
  await page.getByLabel('Ano', { exact: true }).fill('2028');
  await page.getByRole('button', { name: 'Criar cópia', exact: true }).click();

  const copy = page.getByRole('region', { name: name + ' seguinte · 2028', exact: true });
  const checklist = copy.getByRole('region', { name: 'Checklist de conferência', exact: true });
  await expect(checklist).toContainText('0 de 5 itens conferidos');
  await expect(checklist).toContainText('comparadas com ' + name + ', revisão 1');
  const teachersItem = checklist.getByRole('listitem').filter({
    has: page.getByRole('checkbox', { name: 'Professores e habilitações', exact: true }),
  });
  await teachersItem.locator('summary', { hasText: 'desde' }).click();
  // O banco de E2E acumula professores: listas longas de avisos começam recolhidas.
  const attention = teachersItem.locator('details.attention');
  if (!(await attention.evaluate((details: HTMLDetailsElement) => details.open)))
    await attention.locator('summary').click();
  await expect(
    checklist.getByRole('list', { name: 'Alterações: Professores e habilitações' }),
  ).toContainText('Incluído: Professor Docente Novo ' + suffix);
  await expect(
    checklist.getByRole('list', { name: 'Pontos de atenção: Professores e habilitações' }),
  ).toContainText('Professor Docente Novo ' + suffix + ' não tem atribuições nesta revisão.');
  await expect(checklist.getByRole('button', { name: 'Concluir revisão' })).toBeDisabled();

  await checklist
    .getByRole('checkbox', { name: 'Disciplinas, turnos e turmas', exact: true })
    .check();
  await checklist.getByRole('button', { name: 'Salvar conferência' }).click();
  await expect(checklist).toContainText('1 de 5 itens conferidos');
  for (const item of ITEMS.slice(1))
    await checklist.getByRole('checkbox', { name: item, exact: true }).check();
  await checklist.getByRole('button', { name: 'Salvar conferência' }).click();
  await expect(checklist).toContainText('5 de 5 itens conferidos');
  await expect(checklist.getByRole('button', { name: 'Concluir revisão' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await checklist.screenshot({ path: test.info().outputPath('annual-checklist-mobile.png') });

  await page.reload();
  await page.getByRole('button', { name: 'Abrir ' + name + ' seguinte', exact: true }).click();
  await expect(copy).toContainText('Conferência: 5 de 5 itens do checklist.');
  for (const item of ITEMS)
    await expect(checklist.getByRole('checkbox', { name: item, exact: true })).toBeChecked();
});
