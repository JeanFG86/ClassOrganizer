import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

async function send<T>(
  request: APIRequestContext,
  method: 'post' | 'put',
  path: string,
  data: unknown,
): Promise<T> {
  const response = await request[method](path, { data });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

test('grade manual: inserir, mover, trocar, fixar e desfazer com diagnóstico', async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const turma = `Turma grade ${suffix}`;
  const alfa = `Disciplina Alfa ${suffix}`;
  const beta = `Disciplina Beta ${suffix}`;
  const docente = `Docente grade ${suffix}`;
  const subjectA = await send<{ id: string }>(request, 'post', '/api/v1/subjects', { name: alfa });
  const subjectB = await send<{ id: string }>(request, 'post', '/api/v1/subjects', { name: beta });
  const teacher = await send<{ id: string }>(request, 'post', '/api/v1/teachers', {
    name: docente,
    subjectIds: [subjectA.id, subjectB.id],
  });
  const shift = await send<{ id: string; periods: { id: string }[] }>(
    request,
    'post',
    '/api/v1/shifts',
    {
      name: `Turno grade ${suffix}`,
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
  for (const [subject, weeklyLessons] of [
    [subjectA.id, 2],
    [subjectB.id, 1],
  ] as const)
    await send(request, 'post', '/api/v1/assignments', {
      classGroupId: classGroup.id,
      participants: [{ teacherId: teacher.id, subjectId: subject }],
      weeklyLessons,
    });
  const planningName = `Grade fictícia ${suffix}`;
  await send(request, 'post', '/api/v1/plannings', { name: planningName, year: 2027 });

  await page.goto('/planejamentos');
  await page.getByRole('button', { name: 'Abrir ' + planningName, exact: true }).click();
  await page.getByRole('link', { name: 'Abrir grade da revisão 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Grade · ${planningName} · 2027` })).toBeVisible();
  await page.getByLabel('Turma', { exact: true }).selectOption({ label: turma });
  const grid = page.getByRole('table', { name: 'Grade da turma ' + turma, exact: true });
  const confirm = async (summary: string) => {
    const panel = page.getByRole('region', { name: 'Confirmar alteração' });
    await expect(panel).toContainText(summary);
    await expect(panel).toContainText('Nenhum problema novo.');
    await panel.getByRole('button', { name: 'Confirmar alteração' }).click();
    await expect(page.getByRole('status').first()).toContainText('Alteração aplicada.');
  };
  const insert = async (cell: string, option: string) => {
    await grid.getByRole('button', { name: cell }).click();
    await page
      .getByRole('list', { name: 'Opções para inserir' })
      .getByRole('button', { name: 'Inserir ' + option })
      .click();
  };

  await insert('Horário livre: segunda, 1ª aula', `${alfa} · ${docente}`);
  await confirm('Inseriu ' + alfa);
  await insert('Horário livre: segunda, 2ª aula', `${alfa} · ${docente}`);
  await confirm('Inseriu ' + alfa);
  await insert('Horário livre: terça, 1ª aula', `${beta} · ${docente}`);
  await confirm('Inseriu ' + beta);

  // Mover: seleciona a aula e escolhe um horário livre.
  await grid
    .getByRole('button', { name: new RegExp(`^${alfa} \\(${turma}\\), segunda 13:50`) })
    .click();
  await grid.getByRole('button', { name: 'Horário livre: quarta, 1ª aula' }).click();
  await confirm('Moveu ' + alfa);

  // Trocar: seleciona uma aula e escolhe outra.
  await grid.getByRole('button', { name: new RegExp(`^${beta} \\(${turma}\\), terça`) }).click();
  await grid.getByRole('button', { name: new RegExp(`^${alfa} \\(${turma}\\), quarta`) }).click();
  await confirm('Trocou ' + beta);
  await expect(
    grid.getByRole('button', { name: new RegExp(`^${beta} \\(${turma}\\), quarta`) }),
  ).toBeVisible();

  // Fixar impede remover até desfixar.
  await grid.getByRole('button', { name: new RegExp(`^${beta} \\(${turma}\\), quarta`) }).click();
  const selected = page.getByRole('region', { name: 'Aula selecionada' });
  await selected.getByRole('button', { name: 'Fixar' }).click();
  await confirm('Fixou ' + beta);
  await grid.getByRole('button', { name: new RegExp(`^${beta} .*fixada`) }).click();
  await expect(selected.getByRole('button', { name: 'Remover da grade' })).toBeDisabled();
  await selected.getByRole('button', { name: 'Cancelar seleção' }).click();

  // Desfazer registra uma nova entrada e não apaga o histórico.
  await page.getByRole('button', { name: 'Desfazer última alteração' }).click();
  await expect(page.getByRole('status').first()).toContainText('Desfez: Fixou ' + beta);
  const history = page.getByRole('list', { name: 'Alterações da grade' });
  await expect(history.getByRole('listitem')).toHaveCount(7);
  await expect(history).toContainText('desfeita');
  await expect(page.getByText('0 problemas')).toBeVisible();

  // A alteração aparece também na visão do professor e na auditoria.
  await page.getByRole('radio', { name: 'Por professor' }).check();
  await page.getByLabel('Professor', { exact: true }).selectOption({ label: docente });
  await expect(page.getByRole('table', { name: new RegExp(`^Grade de ${docente}`) })).toContainText(
    beta,
  );
  await page.goto('/auditoria');
  await expect(page.getByRole('list', { name: 'Histórico de alterações' })).toContainText(
    'Alteração da grade',
  );
});
