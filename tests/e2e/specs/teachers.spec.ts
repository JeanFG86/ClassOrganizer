import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('cadastrar professor habilitado em disciplinas → recarregar e continuar lá', async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const math = `Matemática ${suffix}`;
  const physics = `Física ${suffix}`;
  const teacher = `Ana Souza ${suffix}`;

  // Disciplinas criadas pela API para focar o teste no fluxo de professores.
  for (const name of [math, physics]) {
    const response = await request.post('/api/v1/subjects', { data: { name } });
    expect(response.status()).toBe(201);
  }

  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Professores' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Professores' })).toBeVisible();

  await page.getByLabel('Nome do professor').fill(teacher);
  const qualifications = page.getByRole('group', { name: 'Disciplinas que pode lecionar' });
  await qualifications.getByRole('checkbox', { name: math }).check();
  await qualifications.getByRole('checkbox', { name: physics }).check();
  await page.getByRole('button', { name: 'Cadastrar professor' }).click();

  await expect(page.getByRole('status').filter({ hasText: teacher })).toHaveText(
    `Professor(a) "${teacher}" cadastrado(a).`,
  );

  const list = page.getByRole('list', { name: 'Professores cadastrados' });
  const entry = list.getByRole('listitem').filter({ hasText: teacher }).locator('.item-name');
  await expect(entry).toHaveText(`${teacher} — ${math}, ${physics}`);

  await page.reload();
  await expect(entry).toHaveText(`${teacher} — ${math}, ${physics}`);
});
