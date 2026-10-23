import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

async function post<T>(request: APIRequestContext, path: string, data: unknown): Promise<T> {
  const response = await request.post(path, { data });
  expect(response.status(), `${path}: ${await response.text()}`).toBe(201);
  return (await response.json()) as T;
}

test('cadastrar turma e atribuir aulas, conferindo totais e regras', async ({ page, request }) => {
  const suffix = randomUUID().slice(0, 8);
  const turma = `6º ano ${suffix}`;
  const math = `Matemática ${suffix}`;
  const ana = `Ana ${suffix}`;
  const secondTeacher = `Docente Beta ${suffix}`;

  const subject = await post<{ id: string }>(request, '/api/v1/subjects', { name: math });
  await post(request, '/api/v1/teachers', { name: ana, subjectIds: [subject.id] });
  await post(request, '/api/v1/teachers', { name: secondTeacher, subjectIds: [subject.id] });

  // Turma pela interface.
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Turmas' })
    .click();
  await page.getByLabel('Nome da turma').fill(turma);
  await page.getByRole('button', { name: 'Cadastrar' }).click();
  await expect(page.getByRole('status')).toHaveText(`Turma "${turma}" cadastrada.`);

  // Atribuição.
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Atribuições' })
    .click();
  await page.getByLabel('Turma', { exact: true }).selectOption({ label: turma });
  await page
    .getByLabel('Disciplina do participante 1', { exact: true })
    .selectOption({ label: math });
  await page
    .getByLabel('Professor do participante 1', { exact: true })
    .selectOption({ label: ana });
  await page.getByLabel('Aulas por semana').fill('5');
  await page.getByRole('button', { name: 'Atribuir' }).click();
  await expect(page.getByRole('status')).toHaveText(`Bloco de aulas em ${turma} criado.`);

  const group = page.getByRole('region', { name: `Turma ${turma}` });
  await expect(group.getByRole('heading')).toHaveText(`${turma} — 5 aulas por semana`);
  const loads = page.getByRole('table', { name: 'Carga semanal por professor' });
  await expect(loads.getByRole('row', { name: new RegExp(ana) })).toContainText('5');

  // A disciplina continua disponível para repartir a carga em outro bloco.
  await expect(
    page
      .getByLabel('Disciplina do participante 1', { exact: true })
      .locator('option', { hasText: math }),
  ).toBeEnabled();

  // Trocar professor e carga.
  await group.getByRole('button', { name: `Editar bloco 1 em ${turma}` }).click();
  await group.getByLabel('Professor do participante 1').selectOption({ label: secondTeacher });
  await group.getByLabel('Aulas por semana do bloco 1').fill('4');
  await group.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toHaveText('Bloco de aulas atualizado.');
  await expect(group.getByRole('heading')).toHaveText(`${turma} — 4 aulas por semana`);

  // Professor com aulas não perde a habilitação nem é arquivado.
  await page.goto('/professores');
  const teachers = page.getByRole('list', { name: 'Professores cadastrados' });
  await teachers.getByRole('button', { name: `Arquivar ${secondTeacher}` }).click();
  await expect(page.getByRole('alert')).toContainText('o professor tem aulas atribuídas');

  await teachers.getByRole('button', { name: `Editar ${secondTeacher}` }).click();
  await page
    .getByRole('group', { name: 'Disciplinas que pode lecionar' })
    .getByRole('checkbox', { name: math })
    .uncheck();
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('alert')).toContainText('Não é possível remover a habilitação');

  // Remover a atribuição exige confirmação; depois disso o professor pode ser arquivado.
  await page.goto('/atribuicoes');
  await group.getByRole('button', { name: `Remover bloco 1 em ${turma}` }).click();
  await group.getByRole('button', { name: `Confirmar remoção do bloco 1 em ${turma}` }).click();
  await expect(page.getByRole('status')).toHaveText('Bloco de aulas removido.');
  await expect(group).toHaveCount(0);

  await page.goto('/professores');
  await teachers.getByRole('button', { name: `Arquivar ${secondTeacher}` }).click();
  await expect(page.getByRole('status')).toHaveText(
    `Professor(a) "${secondTeacher}" arquivado(a).`,
  );
});

test('aulas compartilhadas, disciplinas simultâneas e divisão de carga em blocos', async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const className = 'Turma teste ' + suffix;
  const firstSubject = 'Disciplina Alfa ' + suffix;
  const secondSubject = 'Disciplina Beta ' + suffix;
  const firstTeacher = 'Docente Alfa ' + suffix;
  const secondTeacher = 'Docente Beta ' + suffix;
  const thirdTeacher = 'Docente Gama ' + suffix;
  const subject = await post<{ id: string }>(request, '/api/v1/subjects', { name: firstSubject });
  const otherSubject = await post<{ id: string }>(request, '/api/v1/subjects', {
    name: secondSubject,
  });
  await post(request, '/api/v1/class-groups', { name: className });
  await post(request, '/api/v1/teachers', { name: firstTeacher, subjectIds: [subject.id] });
  const second = await post<{ id: string }>(request, '/api/v1/teachers', {
    name: secondTeacher,
    subjectIds: [subject.id],
    maxWeeklyLessons: 4,
  });
  await post(request, '/api/v1/teachers', { name: thirdTeacher, subjectIds: [otherSubject.id] });

  await page.goto('/atribuicoes');
  const create = page.getByRole('form', { name: 'Novo bloco de aulas' });
  const group = page.getByRole('region', { name: 'Turma ' + className, exact: true });
  await create.getByLabel('Turma', { exact: true }).selectOption({ label: className });
  await create.getByLabel('Aulas por semana', { exact: true }).fill('2');
  await create
    .getByLabel('Disciplina do participante 1', { exact: true })
    .selectOption({ label: firstSubject });
  await create
    .getByLabel('Professor do participante 1', { exact: true })
    .selectOption({ label: firstTeacher });
  await create.getByRole('button', { name: 'Adicionar professor' }).click();
  await create
    .getByLabel('Disciplina do participante 2', { exact: true })
    .selectOption({ label: firstSubject });
  await create
    .getByLabel('Professor do participante 2', { exact: true })
    .selectOption({ label: secondTeacher });
  await create.getByRole('button', { name: 'Adicionar professor' }).click();
  await create
    .getByLabel('Disciplina do participante 3', { exact: true })
    .selectOption({ label: secondSubject });
  await create
    .getByLabel('Professor do participante 3', { exact: true })
    .selectOption({ label: thirdTeacher });
  await create.getByRole('button', { name: 'Atribuir', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Bloco de aulas em ' + className + ' criado.');
  await expect(group.getByRole('heading')).toHaveText(className + ' — 2 aulas por semana');
  await expect(group).toContainText(firstTeacher);
  await expect(group).toContainText(secondTeacher);
  await expect(group).toContainText(thirdTeacher);

  // Outra parte da disciplina ocorre em horários separados, com um professor.
  await create.getByLabel('Aulas por semana', { exact: true }).fill('3');
  await create
    .getByLabel('Disciplina do participante 1', { exact: true })
    .selectOption({ label: firstSubject });
  await create
    .getByLabel('Professor do participante 1', { exact: true })
    .selectOption({ label: secondTeacher });
  await create.getByRole('button', { name: 'Atribuir', exact: true }).click();
  await expect(group.getByRole('heading')).toHaveText(className + ' — 5 aulas por semana');
  const loads = page.getByRole('table', { name: 'Carga semanal por professor' });
  await expect(
    loads
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: firstTeacher, exact: true }) })
      .getByRole('cell')
      .first(),
  ).toHaveText('2');
  await expect(
    loads
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: secondTeacher, exact: true }) })
      .getByRole('cell')
      .first(),
  ).toContainText('5');
  await expect(
    loads
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: thirdTeacher, exact: true }) })
      .getByRole('cell')
      .first(),
  ).toHaveText('2');

  await page.goto('/disponibilidade?professor=' + second.id);
  await expect(
    page.getByText('Aulas atribuídas: 5 de no máximo 4', { exact: false }),
  ).toBeVisible();
  await page.goto('/atribuicoes');
  const sharedRow = group.getByRole('row').filter({ hasText: thirdTeacher });
  await sharedRow.getByRole('button', { name: 'Editar' }).click();
  const edit = group.getByRole('form');
  await edit.getByRole('button', { name: 'Remover participante 3', exact: true }).click();
  await edit.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Bloco de aulas atualizado.');
  await expect(group).not.toContainText(thirdTeacher);
  await expect(group.getByRole('heading')).toHaveText(className + ' — 5 aulas por semana');

  // A página inteira fica dentro dos 375 px; as tabelas rolam dentro do card.
  await page.setViewportSize({ width: 375, height: 812 });
  await create.getByRole('button', { name: 'Atribuir', exact: true }).scrollIntoViewIfNeeded();
  await expect(create.getByRole('button', { name: 'Atribuir', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await create.screenshot({ path: 'test-results/assignments-mobile-form.png' });
  await group.getByRole('button', { name: 'Editar' }).first().click();
  await expect(
    group.getByRole('form').getByRole('button', { name: 'Salvar', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await group.screenshot({ path: 'test-results/assignments-mobile-edit.png' });
});
