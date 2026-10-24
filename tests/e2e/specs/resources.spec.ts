import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

async function post<T>(request: APIRequestContext, path: string, data: unknown): Promise<T> {
  const response = await request.post(path, { data });
  expect(response.status(), `${path}: ${await response.text()}`).toBe(201);
  return (await response.json()) as T;
}

test('cadastrar recurso especial e marcá-lo num bloco de aulas', async ({ page, request }) => {
  const suffix = randomUUID().slice(0, 8);
  const lab = `Laboratório ${suffix}`;
  const turma = `Turma recurso ${suffix}`;
  const subjectName = `Ciências ${suffix}`;
  const teacherName = `Docente recurso ${suffix}`;

  const subject = await post<{ id: string }>(request, '/api/v1/subjects', { name: subjectName });
  await post(request, '/api/v1/teachers', { name: teacherName, subjectIds: [subject.id] });
  await post(request, '/api/v1/class-groups', { name: turma });

  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Recursos' })
    .click();
  await expect(page.getByRole('heading', { name: 'Recursos especiais' })).toBeVisible();
  await page.getByLabel('Nome do recurso').fill(lab);
  await page.getByRole('button', { name: 'Cadastrar' }).click();
  await expect(page.getByRole('status')).toHaveText(`Recurso "${lab}" cadastrado.`);

  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Atribuições' })
    .click();
  await page.getByLabel('Turma', { exact: true }).selectOption({ label: turma });
  await page
    .getByLabel('Disciplina do participante 1', { exact: true })
    .selectOption({ label: subjectName });
  await page
    .getByLabel('Professor do participante 1', { exact: true })
    .selectOption({ label: teacherName });
  await page.getByLabel('Aulas por semana').fill('2');
  await page
    .getByRole('group', { name: 'Recursos especiais usados pelo bloco (opcional)' })
    .getByRole('checkbox', { name: lab, exact: true })
    .check();
  await page.getByRole('button', { name: 'Atribuir' }).click();
  await expect(page.getByRole('status')).toHaveText(`Bloco de aulas em ${turma} criado.`);
  const group = page.getByRole('region', { name: `Turma ${turma}` });
  await expect(group).toContainText(`Recurso: ${lab}`);

  // Arquivado, o recurso some das opções novas, mas continua indicado no bloco.
  await page.goto('/recursos');
  await page
    .getByRole('list', { name: 'Recursos especiais cadastrados' })
    .getByRole('button', { name: `Arquivar ${lab}` })
    .click();
  await expect(page.getByRole('status')).toHaveText(`Recurso "${lab}" arquivado.`);
  await page.goto('/atribuicoes');
  await expect(page.getByRole('region', { name: `Turma ${turma}` })).toContainText(
    `Recurso: ${lab} (arquivado)`,
  );
  await expect(
    page
      .getByRole('form', { name: 'Novo bloco de aulas' })
      .getByRole('checkbox', { name: lab, exact: true }),
  ).toHaveCount(0);
});
