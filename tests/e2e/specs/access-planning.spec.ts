import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('planejamento → conferência → conclusão bloqueada sem grade → cópia com nova revisão necessária', async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const name = 'Plano fictício ' + suffix;
  // Um professor ativo com hora-atividade garante pendência na grade, qualquer que seja o banco.
  expect(
    (
      await request.post('/api/v1/teachers', {
        data: { name: 'Docente com HA ' + suffix, subjectIds: [], planningPeriods: 1 },
      })
    ).status(),
  ).toBe(201);
  await page.goto('/planejamentos');
  await page.getByLabel('Nome do planejamento', { exact: true }).fill(name);
  await page.getByLabel('Ano', { exact: true }).fill('2027');
  await page.getByRole('button', { name: 'Criar planejamento', exact: true }).click();
  const detail = page.getByRole('region', { name: name + ' · 2027', exact: true });
  await expect(detail.getByRole('heading', { name: 'Revisão 1 · Rascunho' })).toBeVisible();
  await detail.getByLabel('Conferi as regras e cargas desta revisão', { exact: true }).check();
  await detail
    .getByLabel('Conferi a disponibilidade e a hora-atividade desta revisão', { exact: true })
    .check();
  await detail.getByRole('button', { name: 'Salvar conferência' }).click();
  await expect(detail.getByRole('button', { name: 'Concluir revisão' })).toBeEnabled();
  await detail.getByRole('button', { name: 'Concluir revisão' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'A grade precisa estar completa e sem problemas para concluir a revisão.',
  );
  await expect(detail.getByRole('heading', { name: 'Revisão 1 · Rascunho' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await detail.getByRole('button', { name: 'Baixar revisão 1', exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toContain('-revisao-1.json');
  await page.getByRole('button', { name: 'Copiar ' + name, exact: true }).click();
  await page.getByRole('button', { name: 'Criar cópia', exact: true }).click();
  const copy = page.getByRole('region', { name: name + ' — cópia · 2027', exact: true });
  await expect(copy).toContainText('Regras: revisão necessária');
  await expect(copy.getByRole('button', { name: 'Concluir revisão' })).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: 'Abrir ' + name + ' — cópia', exact: true }).click();
  await expect(copy.getByRole('heading', { name: 'Revisão 1 · Rascunho' })).toBeVisible();
  await page.goto('/auditoria');
  await expect(page.getByRole('list', { name: 'Histórico de alterações' })).toContainText(
    'Cópia de planejamento',
  );
});

test('login de consulta permite ler e baixar, rejeita alteração e encerra a sessão', async ({
  browser,
  request,
  baseURL,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const username = 'consulta-' + suffix;
  const password = 'senha ficticia e2e 2026!';
  expect(
    (
      await request.post('/api/v1/users', { data: { username, password, role: 'viewer' } })
    ).status(),
  ).toBe(201);
  const planningName = 'Consulta fictícia ' + suffix;
  expect(
    (
      await request.post('/api/v1/plannings', { data: { name: planningName, year: 2027 } })
    ).status(),
  ).toBe(201);
  const context = await browser.newContext({
    baseURL: baseURL ?? 'http://localhost:8080',
    storageState: { cookies: [], origins: [] },
  });
  try {
    const page = await context.newPage();
    await page.goto('/planejamentos');
    await expect(page.getByRole('heading', { name: 'Entrar no EntreAulas' })).toBeVisible();
    await page.getByLabel('Usuário', { exact: true }).fill(username);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Organizador de aulas' })).toBeVisible();
    await page.getByRole('link', { name: 'Disciplinas', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Cadastrar', exact: true })).toHaveCount(0);
    const mutation = await context.request.post('/api/v1/subjects', {
      headers: { 'x-entreaulas-client': 'web' },
      data: { name: 'Operação proibida ' + suffix },
    });
    expect(mutation.status()).toBe(403);
    await page.getByRole('link', { name: 'Planejamentos', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir ' + planningName, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Criar planejamento', exact: true })).toHaveCount(
      0,
    );
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar revisão 1', exact: true }).click();
    expect((await download).suggestedFilename()).toContain('-revisao-1.json');
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Entrar no EntreAulas' })).toBeVisible();
    expect((await context.request.get('/api/v1/subjects')).status()).toBe(401);
  } finally {
    await context.close();
  }
});

test('administrador cria e desativa acesso pela tela', async ({ page }) => {
  const username = 'acesso-' + randomUUID().slice(0, 8);
  await page.goto('/acessos');
  await page.getByLabel('Usuário do novo acesso', { exact: true }).fill(username);
  await page.getByLabel('Senha inicial', { exact: true }).fill('senha ficticia e2e 2026!');
  await page.getByRole('button', { name: 'Criar acesso', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Acesso criado.' })).toHaveText(
    'Acesso criado.',
  );
  await page.getByRole('button', { name: 'Editar acesso ' + username, exact: true }).click();
  await page.getByLabel('Desativar acesso', { exact: true }).check();
  await page.getByRole('button', { name: 'Salvar acesso', exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: username })).toContainText(
    'Desativado',
  );
});
