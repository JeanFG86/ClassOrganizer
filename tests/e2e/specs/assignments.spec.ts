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
  const bruno = `Bruno ${suffix}`;

  const subject = await post<{ id: string }>(request, '/api/v1/subjects', { name: math });
  await post(request, '/api/v1/teachers', { name: ana, subjectIds: [subject.id] });
  await post(request, '/api/v1/teachers', { name: bruno, subjectIds: [subject.id] });

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
  await page.getByLabel('Disciplina', { exact: true }).selectOption({ label: math });
  await page.getByLabel('Professor', { exact: true }).selectOption({ label: ana });
  await page.getByLabel('Aulas por semana').fill('5');
  await page.getByRole('button', { name: 'Atribuir' }).click();
  await expect(page.getByRole('status')).toHaveText(
    `${math} em ${turma} atribuída a ${ana} (5 aulas por semana).`,
  );

  const group = page.getByRole('region', { name: `Turma ${turma}` });
  await expect(group.getByRole('heading')).toHaveText(`${turma} — 5 aulas por semana`);
  const loads = page.getByRole('table', { name: 'Carga semanal por professor' });
  await expect(loads.getByRole('row', { name: new RegExp(ana) })).toContainText('5');

  // A mesma disciplina não pode receber outro professor na turma.
  await expect(
    page.getByLabel('Disciplina', { exact: true }).locator('option', { hasText: math }),
  ).toBeDisabled();

  // Trocar professor e carga.
  await group.getByRole('button', { name: `Editar ${math} em ${turma}` }).click();
  await group.getByLabel(`Professor de ${math}`).selectOption({ label: bruno });
  await group.getByLabel(`Aulas por semana de ${math}`).fill('4');
  await group.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toHaveText(
    `Atribuição de ${math} em ${turma} atualizada.`,
  );
  await expect(group.getByRole('heading')).toHaveText(`${turma} — 4 aulas por semana`);

  // Professor com aulas não perde a habilitação nem é arquivado.
  await page.goto('/professores');
  const teachers = page.getByRole('list', { name: 'Professores cadastrados' });
  await teachers.getByRole('button', { name: `Arquivar ${bruno}` }).click();
  await expect(page.getByRole('alert')).toContainText('o professor tem aulas atribuídas');

  await teachers.getByRole('button', { name: `Editar ${bruno}` }).click();
  await page
    .getByRole('group', { name: 'Disciplinas que pode lecionar' })
    .getByRole('checkbox', { name: math })
    .uncheck();
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('alert')).toContainText('Não é possível remover a habilitação');

  // Remover a atribuição exige confirmação; depois disso o professor pode ser arquivado.
  await page.goto('/atribuicoes');
  await group.getByRole('button', { name: `Remover ${math} em ${turma}` }).click();
  await group.getByRole('button', { name: `Confirmar remoção de ${math} em ${turma}` }).click();
  await expect(page.getByRole('status')).toHaveText(`Atribuição de ${math} em ${turma} removida.`);
  await expect(group).toHaveCount(0);

  await page.goto('/professores');
  await teachers.getByRole('button', { name: `Arquivar ${bruno}` }).click();
  await expect(page.getByRole('status')).toHaveText(`Professor(a) "${bruno}" arquivado(a).`);
});
