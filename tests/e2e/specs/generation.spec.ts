import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

async function send<T>(
  request: APIRequestContext,
  method: 'post' | 'put' | 'get',
  path: string,
  data?: unknown,
): Promise<T> {
  const response =
    method === 'get' ? await request.get(path) : await request[method](path, { data });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

test('geração automática: solicitar, acompanhar, comparar e aplicar mantendo a fixação', async ({
  page,
  request,
}) => {
  // A busca roda no worker do Compose; a fotografia inclui os cadastros acumulados no banco.
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const turma = `Turma geração ${suffix}`;
  const alfa = `Disciplina Alfa ${suffix}`;
  const beta = `Disciplina Beta ${suffix}`;
  const docente = `Docente geração ${suffix}`;
  const subjectA = await send<{ id: string }>(request, 'post', '/api/v1/subjects', { name: alfa });
  const subjectB = await send<{ id: string }>(request, 'post', '/api/v1/subjects', { name: beta });
  const teacher = await send<{ id: string }>(request, 'post', '/api/v1/teachers', {
    name: docente,
    subjectIds: [subjectA.id, subjectB.id],
    planningPeriods: 1,
  });
  const shift = await send<{ id: string; periods: { id: string }[] }>(
    request,
    'post',
    '/api/v1/shifts',
    {
      name: `Turno geração ${suffix}`,
      periods: [
        { start: '13:00', end: '13:50' },
        { start: '13:50', end: '14:40' },
      ],
    },
  );
  const classGroup = await send<{ id: string; version: number }>(
    request,
    'post',
    '/api/v1/class-groups',
    { name: turma },
  );
  await send(request, 'put', `/api/v1/class-groups/${classGroup.id}/schedule`, {
    shiftId: shift.id,
    periodIds: shift.periods.map((p) => p.id),
    version: classGroup.version,
  });
  const blocks: string[] = [];
  for (const [subject, weeklyLessons] of [
    [subjectA.id, 2],
    [subjectB.id, 1],
  ] as const)
    blocks.push(
      (
        await send<{ id: string }>(request, 'post', '/api/v1/assignments', {
          classGroupId: classGroup.id,
          participants: [{ teacherId: teacher.id, subjectId: subject }],
          weeklyLessons,
        })
      ).id,
    );
  const planningName = `Geração fictícia ${suffix}`;
  const planning = await send<{ id: string; version: number }>(
    request,
    'post',
    '/api/v1/plannings',
    { name: planningName, year: 2027 },
  );
  const detail = await send<{ revisions: { id: string }[] }>(
    request,
    'get',
    `/api/v1/plannings/${planning.id}`,
  );
  const revisionId = detail.revisions[0]?.id ?? '';
  // Fixa a aula de Beta na quarta, 1ª aula: a geração precisa mantê-la.
  let version = planning.version;
  const slot = { kind: 'lesson', entityId: blocks[1], weekday: 3, periodId: shift.periods[0]?.id };
  for (const operation of [
    { type: 'place', slot },
    { type: 'pin', slot, pinned: true },
  ])
    version = (
      await send<{ version: number }>(
        request,
        'post',
        `/api/v1/plannings/${planning.id}/grid/operations`,
        { version, revisionId, operation },
      )
    ).version;

  await page.goto('/planejamentos');
  await page.getByRole('button', { name: 'Abrir ' + planningName, exact: true }).click();
  await page.getByRole('link', { name: 'Abrir geração automática da revisão 1' }).click();
  await expect(
    page.getByRole('heading', { name: `Geração automática · ${planningName} · 2027` }),
  ).toBeVisible();
  await expect(page.getByText('Nenhuma geração solicitada nesta revisão.')).toBeVisible();

  const criteria = page.getByRole('group', { name: 'Prioridades da geração' });
  await criteria.getByLabel('Distribuir cada disciplina pelos dias', { exact: true }).uncheck();
  await criteria
    .getByRole('button', { name: 'Descer a prioridade de Manter a grade atual' })
    .click();
  await page.getByRole('button', { name: 'Gerar grade' }).click();
  await expect(page.getByRole('status').first()).toContainText(/Geração (solicitada|terminada)/);
  const result = page.getByRole('region', { name: 'Grade completa encontrada' });
  await expect(result).toBeVisible({ timeout: 90_000 });
  await expect(result).toContainText('Mantidas no lugar');
  await expect(result).toContainText(
    'Prioridades: 1. Evitar janelas dos professores; 2. Manter a grade atual.',
  );
  await expect(result).toContainText('Disciplinas repetidas no dia');

  await result.getByLabel('Turma', { exact: true }).selectOption({ label: turma });
  const proposal = result.getByRole('table', { name: 'Proposta para a turma ' + turma });
  await expect(proposal.getByRole('img', { name: new RegExp(`^${beta} .*fixada`) })).toBeVisible();
  await expect(proposal.getByRole('img', { name: new RegExp(`^${alfa} `) })).toHaveCount(2);

  await result.getByRole('button', { name: 'Aplicar proposta' }).click();
  await result.getByRole('button', { name: 'Confirmar aplicação' }).click();
  await expect(page.getByRole('status').first()).toContainText('Proposta aplicada à grade.');
  await expect(page.getByRole('table', { name: 'Gerações desta revisão' })).toContainText(
    'Aplicada',
  );

  await page.getByRole('link', { name: '← Grade' }).click();
  await expect(page.getByRole('heading', { name: `Grade · ${planningName} · 2027` })).toBeVisible();
  await page.getByLabel('Turma', { exact: true }).selectOption({ label: turma });
  const grid = page.getByRole('table', { name: 'Grade da turma ' + turma, exact: true });
  await expect(
    grid.getByRole('button', { name: new RegExp(`^${beta} \\(${turma}\\), quarta 13:00.*fixada`) }),
  ).toBeVisible();
  await expect(grid.getByRole('button', { name: new RegExp(`^${alfa} `) })).toHaveCount(2);
  await expect(page.getByRole('list', { name: 'Alterações da grade' })).toContainText(
    'Aplicou a geração automática',
  );
});
