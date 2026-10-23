import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('cadastrar turno com aulas e marcar as aulas de uma turma', async ({ page, request }) => {
  const suffix = randomUUID().slice(0, 8);
  const shiftName = `Manhã ${suffix}`;
  const turma = `8º A ${suffix}`;
  const created = await request.post('/api/v1/class-groups', { data: { name: turma } });
  expect(created.status()).toBe(201);

  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Turnos' })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Turnos e horários');

  // Turno com três aulas: a segunda é sugerida a partir da primeira; há intervalo antes da terceira.
  await page.getByLabel('Nome do turno').fill(shiftName);
  await page.getByLabel('Início da 1ª aula').fill('07:30');
  await page.getByLabel('Fim da 1ª aula').fill('08:20');
  await page.getByRole('button', { name: 'Adicionar aula' }).click();
  await expect(page.getByLabel('Início da 2ª aula')).toHaveValue('08:20');
  await expect(page.getByLabel('Fim da 2ª aula')).toHaveValue('09:10');
  await page.getByRole('button', { name: 'Adicionar aula' }).click();
  await page.getByLabel('Início da 3ª aula').fill('09:30');
  await page.getByLabel('Fim da 3ª aula').fill('10:20');
  await page.getByRole('button', { name: 'Cadastrar turno' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'cadastrado' })).toHaveText(
    `Turno "${shiftName}" cadastrado.`,
  );

  const card = page.getByRole('region', { name: shiftName });
  await expect(card).toContainText('3 aulas · 07:30–10:20');
  await expect(card).toContainText('Intervalo de 20 min');

  // Turma no turno, sem a 3ª aula.
  await card.getByLabel('Turma para adicionar ao turno').selectOption({ label: turma });
  await card.getByRole('button', { name: 'Adicionar', exact: true }).click();
  const third = card.getByLabel(`${turma}: 3ª aula (09:30–10:20)`);
  await expect(third).toBeChecked();
  await third.uncheck();
  await expect(card.getByRole('row', { name: new RegExp(turma) })).toContainText('(2)');

  await page.reload();
  await expect(card.getByLabel(`${turma}: 3ª aula (09:30–10:20)`)).not.toBeChecked();
  await expect(card.getByLabel(`${turma}: 2ª aula (08:20–09:10)`)).toBeChecked();

  // Aula marcada na turma não pode ser removida do turno.
  await card.getByRole('button', { name: `Editar o turno ${shiftName}` }).click();
  await card.getByRole('button', { name: 'Remover 2ª aula' }).click();
  await card.getByRole('button', { name: 'Salvar' }).click();
  await expect(card.getByRole('alert')).toContainText(
    `A aula removida está marcada nas turmas ${turma}.`,
  );
  await card.getByRole('button', { name: 'Cancelar' }).click();

  // Turno com turma ativa não pode ser arquivado.
  await card.getByRole('button', { name: `Arquivar o turno ${shiftName}` }).click();
  await expect(card.getByRole('alert')).toContainText(`O turno tem as turmas ${turma}.`);

  // A lista de turmas mostra o turno e as aulas por dia.
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Turmas' })
    .click();
  await expect(
    page
      .getByRole('list', { name: 'Turmas cadastradas' })
      .getByRole('listitem')
      .filter({ hasText: turma }),
  ).toContainText(`${shiftName}, 2 aulas por dia`);
});
