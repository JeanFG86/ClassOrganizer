import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

async function post<T>(request: APIRequestContext, path: string, data: unknown): Promise<T> {
  const response = await request.post(path, { data });
  expect(response.status(), `${path}: ${await response.text()}`).toBe(201);
  return (await response.json()) as T;
}

test('carga máxima, hora-atividade e disponibilidade do professor', async ({ page, request }) => {
  const suffix = randomUUID().slice(0, 8);
  const math = `Matemática ${suffix}`;
  const shiftName = `Tarde ${suffix}`;
  const teacher = `Paula ${suffix}`;
  const turma = `7º B ${suffix}`;

  const subject = await post<{ id: string }>(request, '/api/v1/subjects', { name: math });
  await post(request, '/api/v1/shifts', {
    name: shiftName,
    periods: [
      { start: '13:00', end: '13:50' },
      { start: '13:50', end: '14:40' },
    ],
  });

  // Professor com carga máxima e hora-atividade, pela interface.
  await page.goto('/professores');
  await page.getByLabel('Nome do professor').fill(teacher);
  await page.getByLabel(math).check();
  await page.getByLabel('Carga máxima (aulas por semana)').fill('2');
  await page.getByLabel('Hora-atividade (aulas por semana)').fill('3');
  await page.getByRole('button', { name: 'Cadastrar professor' }).click();
  const entry = page
    .getByRole('list', { name: 'Professores cadastrados' })
    .getByRole('listitem')
    .filter({ hasText: teacher });
  await expect(entry).toContainText('até 2 aulas · 3 de hora-atividade');

  // Disponibilidade: segunda inteira e a 2ª aula de quarta.
  await entry.getByRole('link', { name: `Disponibilidade de ${teacher}` }).click();
  await expect(page.getByLabel('Professor', { exact: true })).toHaveValue(/.+/);
  const grid = page.getByRole('region', { name: shiftName });
  await grid.getByRole('button', { name: `segunda inteira indisponível na ${shiftName}` }).click();
  await grid.getByLabel(`Indisponível na quarta, 2ª aula da ${shiftName} (13:50–14:40)`).check();
  await page.getByRole('button', { name: 'Salvar disponibilidade' }).click();
  await expect(page.getByRole('status')).toHaveText(`Disponibilidade de ${teacher} salva.`);

  await page.reload();
  await expect(
    grid.getByLabel(`Indisponível na segunda, 1ª aula da ${shiftName} (13:00–13:50)`),
  ).toBeChecked();
  await expect(
    grid.getByLabel(`Indisponível na quarta, 2ª aula da ${shiftName} (13:50–14:40)`),
  ).toBeChecked();
  await expect(
    grid.getByLabel(`Indisponível na quarta, 1ª aula da ${shiftName} (13:00–13:50)`),
  ).not.toBeChecked();
  await expect(page.getByText('Indisponível em 3 horários')).toBeVisible();

  // Atribuição acima da carga máxima gera alerta, sem bloquear.
  const teachers = await (await request.get('/api/v1/teachers')).json();
  const created = (teachers.items as { id: string; name: string }[]).find(
    (t) => t.name === teacher,
  );
  const classGroup = await post<{ id: string }>(request, '/api/v1/class-groups', { name: turma });
  await post(request, '/api/v1/assignments', {
    classGroupId: classGroup.id,
    subjectId: subject.id,
    teacherId: created?.id,
    weeklyLessons: 3,
  });
  await page.goto('/atribuicoes');
  await expect(page.getByText('Acima da carga máxima:')).toContainText(`${teacher} (3 de 2)`);
});
