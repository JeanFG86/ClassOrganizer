import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('a aplicação abre e a API está pronta', async ({ page, request }) => {
  const ready = await request.get('/api/v1/subjects');
  expect(ready.ok()).toBe(true);

  await page.goto('/');

  await expect(page).toHaveTitle('Início · EntreAulas');
  await expect(page.getByRole('heading', { level: 1, name: 'Organizador de aulas' })).toBeVisible();
});

test('cadastrar disciplina → ver na lista → recarregar e continuar lá', async ({ page }) => {
  // Nome único para o teste não depender do estado do banco.
  const name = `Ciências ${randomUUID().slice(0, 8)}`;

  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Disciplinas' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Disciplinas' })).toBeVisible();

  await page.getByLabel('Nome da disciplina').fill(name);
  await page.getByRole('button', { name: 'Cadastrar' }).click();

  await expect(page.getByRole('status').filter({ hasText: name })).toHaveText(
    `Disciplina "${name}" cadastrada.`,
  );
  const list = page.getByRole('list', { name: 'Disciplinas cadastradas' });
  await expect(list.getByText(name, { exact: true })).toBeVisible();

  await page.reload();
  await expect(list.getByText(name, { exact: true })).toBeVisible();
});

test('nome duplicado mostra mensagem compreensível', async ({ page }) => {
  const name = `Geografia ${randomUUID().slice(0, 8)}`;
  await page.goto('/disciplinas');

  await page.getByLabel('Nome da disciplina').fill(name);
  await page.getByRole('button', { name: 'Cadastrar' }).click();
  await expect(page.getByRole('status').filter({ hasText: name })).toBeVisible();

  await page.getByLabel('Nome da disciplina').fill(name.toUpperCase());
  await page.getByRole('button', { name: 'Cadastrar' }).click();

  await expect(page.getByRole('alert')).toContainText('Já existe uma disciplina chamada');
});
