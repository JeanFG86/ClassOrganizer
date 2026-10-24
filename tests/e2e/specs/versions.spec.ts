import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  planningDetailSchema,
  revisionRestoreResultSchema,
  gridViewSchema,
} from '@classorganizer/contracts';

test('versões: nomear, preservar, comparar e restaurar sem alterar o histórico, inclusive no celular', async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const name = 'Versões fictícias ' + suffix;
  const created = await request.post('/api/v1/plannings', { data: { name, year: 2027 } });
  expect(created.status()).toBe(201);
  const planning = planningDetailSchema.parse(
    await (
      await request.get('/api/v1/plannings/' + ((await created.json()) as { id: string }).id)
    ).json(),
  );
  const first = planning.revisions[0];
  if (!first) throw new Error('Revisão inicial ausente.');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/planejamentos');
  await page.getByRole('button', { name: 'Abrir ' + name, exact: true }).click();
  const panel = page.getByRole('region', { name: 'Versões do planejamento', exact: true });
  await panel
    .getByLabel('Nome da revisão (opcional)', { exact: true })
    .fill('Antes dos ajustes ' + suffix);
  await panel.getByRole('button', { name: 'Salvar nome da revisão' }).click();
  await expect(panel.getByRole('status')).toHaveText('Nome da revisão salvo.');
  await panel.getByRole('button', { name: 'Preservar revisão e continuar' }).click();
  await expect(
    page.getByRole('heading', { name: 'Revisão 2 · Rascunho', exact: true }),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Comparar revisões' }).click();
  await expect(panel).toContainText('Da revisão 1 para a revisão 2');
  await expect(panel).toContainText('0 alocações mantidas · 0 removidas · 0 incluídas');
  await panel.screenshot({ path: test.info().outputPath('versions-mobile.png') });
  await panel.getByRole('button', { name: 'Restaurar revisão 1', exact: true }).click();
  await expect(panel.getByRole('group', { name: 'Confirmar restauração' })).toBeVisible();
  const restoredResponse = page.waitForResponse(
    (response) => response.url().endsWith('/restore') && response.request().method() === 'POST',
  );
  await panel.getByRole('button', { name: 'Confirmar restauração', exact: true }).click();
  const restored = revisionRestoreResultSchema.parse(await (await restoredResponse).json());
  await expect(
    page.getByRole('heading', { name: 'Revisão 3 · Rascunho', exact: true }),
  ).toBeVisible();
  const detail = planningDetailSchema.parse(
    await (await request.get('/api/v1/plannings/' + planning.id)).json(),
  );
  expect(detail.revisions).toHaveLength(3);
  expect(detail.revisions[2]).toMatchObject({
    snapshot: first.snapshot,
    gridRules: first.gridRules,
    restoredFromId: first.id,
    sealedAt: null,
    reviewedItems: [],
  });
  expect(restored.revisionId).toBe(detail.revisions[2]?.id);
  const historical = gridViewSchema.parse(
    await (
      await request.get(`/api/v1/plannings/${planning.id}/grid?revisionId=${first.id}`)
    ).json(),
  );
  expect(historical.editable).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.reload();
  await page.getByRole('button', { name: 'Abrir ' + name, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Revisão 3 · Rascunho', exact: true }),
  ).toBeVisible();
});
