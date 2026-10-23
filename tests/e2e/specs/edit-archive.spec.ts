import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

async function createSubject(request: APIRequestContext, name: string) {
  const response = await request.post('/api/v1/subjects', { data: { name } });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; version: number };
}

test('renomear, arquivar e restaurar disciplina', async ({ page, request }) => {
  const suffix = randomUUID().slice(0, 8);
  const original = `Artes ${suffix}`;
  const renamed = `Arte e Cultura ${suffix}`;
  await createSubject(request, original);

  await page.goto('/disciplinas');
  const active = page.getByRole('list', { name: 'Disciplinas cadastradas' });

  await active.getByRole('button', { name: `Editar ${original}` }).click();
  const editInput = page.getByLabel(`Novo nome para ${original}`);
  await expect(editInput).toBeFocused();
  await editInput.fill(renamed);
  await editInput.press('Enter');
  await expect(page.getByRole('status')).toHaveText(`Disciplina renomeada para "${renamed}".`);
  await expect(active.getByText(renamed, { exact: true })).toBeVisible();

  await active.getByRole('button', { name: `Arquivar ${renamed}` }).click();
  await expect(page.getByRole('status')).toHaveText(`Disciplina "${renamed}" arquivada.`);
  const archived = page.getByRole('list', { name: 'Disciplinas arquivadas' });
  await expect(archived.getByText(renamed, { exact: true })).toBeVisible();
  await expect(active.getByText(renamed, { exact: true })).toHaveCount(0);

  // Disciplina arquivada não aparece como opção para novos professores.
  await page.goto('/professores');
  await expect(page.getByRole('checkbox', { name: renamed })).toHaveCount(0);

  await page.goto('/disciplinas');
  await archived.getByRole('button', { name: `Restaurar ${renamed}` }).click();
  await expect(page.getByRole('status')).toHaveText(`Disciplina "${renamed}" restaurada.`);
  await expect(active.getByText(renamed, { exact: true })).toBeVisible();
});

test('editar professor e arquivá-lo', async ({ page, request }) => {
  const suffix = randomUUID().slice(0, 8);
  const math = `Matemática ${suffix}`;
  const physics = `Física ${suffix}`;
  const teacher = `Bruno Lima ${suffix}`;
  const mathSubject = await createSubject(request, math);
  await createSubject(request, physics);
  const created = await request.post('/api/v1/teachers', {
    data: { name: teacher, subjectIds: [mathSubject.id] },
  });
  expect(created.status()).toBe(201);

  await page.goto('/professores');
  const active = page.getByRole('list', { name: 'Professores cadastrados' });
  await active.getByRole('button', { name: `Editar ${teacher}` }).click();

  await expect(page.getByRole('heading', { name: `Editar professor: ${teacher}` })).toBeVisible();
  const qualifications = page.getByRole('group', { name: 'Disciplinas que pode lecionar' });
  await expect(qualifications.getByRole('checkbox', { name: math })).toBeChecked();
  await qualifications.getByRole('checkbox', { name: math }).uncheck();
  await qualifications.getByRole('checkbox', { name: physics }).check();
  await page.getByRole('button', { name: 'Salvar alterações' }).click();

  await expect(page.getByRole('status')).toHaveText(`Professor(a) "${teacher}" atualizado(a).`);
  const entry = active.getByRole('listitem').filter({ hasText: teacher }).locator('.item-name');
  await expect(entry).toHaveText(`${teacher} — ${physics}`);

  await page.reload();
  await expect(entry).toHaveText(`${teacher} — ${physics}`);

  await active.getByRole('button', { name: `Arquivar ${teacher}` }).click();
  await expect(page.getByRole('status')).toHaveText(`Professor(a) "${teacher}" arquivado(a).`);
  await expect(
    page.getByRole('list', { name: 'Professores arquivados' }).getByText(teacher),
  ).toBeVisible();
});

test('alteração feita em outra tela não é sobrescrita', async ({ page, request }) => {
  const suffix = randomUUID().slice(0, 8);
  const original = `Química ${suffix}`;
  const subject = await createSubject(request, original);

  await page.goto('/disciplinas');
  const active = page.getByRole('list', { name: 'Disciplinas cadastradas' });
  await expect(active.getByText(original, { exact: true })).toBeVisible();

  // Outra pessoa renomeia enquanto esta tela ainda mostra a versão antiga.
  const otherScreen = await request.put(`/api/v1/subjects/${subject.id}`, {
    data: { name: `Química Geral ${suffix}`, version: subject.version },
  });
  expect(otherScreen.status()).toBe(200);

  await active.getByRole('button', { name: `Editar ${original}` }).click();
  await page.getByLabel(`Novo nome para ${original}`).fill(`Química Orgânica ${suffix}`);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText('alterado em outra tela');
  await expect(active.getByText(`Química Geral ${suffix}`, { exact: true })).toBeVisible();
  await expect(active.getByText(`Química Orgânica ${suffix}`)).toHaveCount(0);
});
