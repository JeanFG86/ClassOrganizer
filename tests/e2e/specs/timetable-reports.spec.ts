import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { planningDetailSchema, gridViewSchema } from '@classorganizer/contracts';

async function send<T>(
  request: APIRequestContext,
  method: 'post' | 'put',
  path: string,
  data: unknown,
): Promise<T> {
  const response = await request[method]('/api/v1/' + path, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T;
}
async function pdfPages(data: Buffer) {
  const task = getDocument({ data: new Uint8Array(data), useSystemFonts: true });
  const document = await task.promise;
  try {
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      pages.push(content.items.flatMap((item) => ('str' in item ? [item.str] : [])).join(' '));
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

test('impressão histórica por turma e professor gera PDF com identificação, fixação e HA', async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const subjectName = 'Disciplina impressão ' + suffix;
  const teacherName = 'Docente impressão ' + suffix;
  const groupName = 'Turma impressão ' + suffix;
  const subject = await send<{ id: string }>(request, 'post', 'subjects', { name: subjectName });
  const teacher = await send<{ id: string; version: number }>(request, 'post', 'teachers', {
    name: teacherName,
    subjectIds: [subject.id],
    planningPeriods: 1,
  });
  const shift = await send<{ id: string; periods: { id: string }[] }>(request, 'post', 'shifts', {
    name: 'Turno impressão ' + suffix,
    periods: [
      { start: '07:00', end: '07:50' },
      { start: '07:50', end: '08:40' },
    ],
  });
  const group = await send<{ id: string; version: number }>(request, 'post', 'class-groups', {
    name: groupName,
  });
  await send(request, 'put', `class-groups/${group.id}/schedule`, {
    version: group.version,
    shiftId: shift.id,
    periodIds: shift.periods.map((p) => p.id),
  });
  const block = await send<{ id: string }>(request, 'post', 'assignments', {
    classGroupId: group.id,
    weeklyLessons: 1,
    participants: [{ teacherId: teacher.id, subjectId: subject.id }],
  });
  const plan = await send<{ id: string; version: number }>(request, 'post', 'plannings', {
    name: 'Plano de impressão ' + suffix,
    year: 2027,
  });
  const detail = planningDetailSchema.parse(
    await (await request.get(`/api/v1/plannings/${plan.id}`)).json(),
  );
  const revision = detail.revisions[0];
  if (!revision) throw new Error('Revisão ausente.');
  let version = plan.version;
  for (const operation of [
    {
      type: 'place',
      slot: { kind: 'lesson', entityId: block.id, weekday: 1, periodId: shift.periods[0]?.id },
    },
    {
      type: 'pin',
      pinned: true,
      slot: { kind: 'lesson', entityId: block.id, weekday: 1, periodId: shift.periods[0]?.id },
    },
    {
      type: 'place',
      slot: { kind: 'planning', entityId: teacher.id, weekday: 2, periodId: shift.periods[1]?.id },
    },
  ]) {
    version = (
      await send<{ version: number }>(request, 'post', `plannings/${plan.id}/grid/operations`, {
        version,
        revisionId: revision.id,
        operation,
      })
    ).version;
  }
  await send(request, 'post', `plannings/${plan.id}/revisions/${revision.id}/preserve`, {
    version,
  });
  await send(request, 'put', `teachers/${teacher.id}`, {
    version: teacher.version,
    name: 'Nome atual diferente ' + suffix,
    subjectIds: [subject.id],
    planningPeriods: 1,
  });
  await page.goto('/planejamentos');
  await page.getByRole('button', { name: 'Abrir ' + detail.name, exact: true }).click();
  await page.getByRole('link', { name: 'Imprimir revisão 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Impressão e PDF', exact: true })).toBeVisible();
  await page.getByLabel('Turma para imprimir', { exact: true }).selectOption(group.id);
  await expect(page.getByRole('button', { name: 'Imprimir / salvar PDF' })).toBeEnabled();
  const classPdf = await pdfPages(
    await page.pdf({
      path: test.info().outputPath('turma.pdf'),
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
    }),
  );
  expect(classPdf).toHaveLength(1);
  expect(classPdf[0]).toContain(groupName);
  expect(classPdf[0]).toContain(teacherName);
  expect(classPdf[0]).toContain('Revisão 1');
  expect(classPdf[0]).toContain('Histórica');
  expect(classPdf[0]).toContain('RASCUNHO');
  expect(classPdf[0]).toContain('Fixada');
  expect(classPdf[0]).not.toContain('Atualizar prévia');
  await page.getByLabel('Organizar por', { exact: true }).selectOption('teacher');
  await expect(page.getByLabel('Professor para imprimir', { exact: true })).toBeVisible();
  await page.getByLabel('Professor para imprimir', { exact: true }).selectOption(teacher.id);
  await expect(page.getByRole('button', { name: 'Imprimir / salvar PDF' })).toBeEnabled();
  const teacherPdf = await pdfPages(
    await page.pdf({
      path: test.info().outputPath('professor.pdf'),
      preferCSSPageSize: true,
      printBackground: true,
    }),
  );
  expect(teacherPdf).toHaveLength(1);
  expect(teacherPdf[0]).toContain('Hora-atividade');
  expect(teacherPdf[0]).toContain(teacherName);
  expect(teacherPdf[0]).not.toContain('Nome atual diferente');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('impressao-mobile.png'), fullPage: true });
  expect(
    gridViewSchema.parse(
      await (
        await request.get(`/api/v1/plannings/${plan.id}/grid?revisionId=${revision.id}`)
      ).json(),
    ).placements,
  ).toHaveLength(2);
});

test('PDF longo repete identificação, numera páginas e conserva o texto até a última aula', async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const subjects: { id: string; name: string }[] = [];
  for (let number = 1; number <= 12; number++) {
    subjects.push(
      await send(request, 'post', 'subjects', {
        name: `Disciplina inventada de nome extenso para verificar impressão ${number} ${suffix}`,
      }),
    );
  }
  const teacher = await send<{ id: string }>(request, 'post', 'teachers', {
    name:
      'Docente inventado com nome extenso para verificar paginação sem cortes ou perda de conteúdo ' +
      suffix,
    subjectIds: subjects.map((s) => s.id),
  });
  const periods = Array.from({ length: 12 }, (_, index) => {
    const time = (minute: number) =>
      String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
    return { start: time(420 + index * 25), end: time(445 + index * 25) };
  });
  const shift = await send<{ id: string; periods: { id: string }[] }>(request, 'post', 'shifts', {
    name: 'Turno extenso ' + suffix,
    periods,
  });
  const group = await send<{ id: string; version: number }>(request, 'post', 'class-groups', {
    name: 'Turma paginação ' + suffix,
  });
  await send(request, 'put', `class-groups/${group.id}/schedule`, {
    version: group.version,
    shiftId: shift.id,
    periodIds: shift.periods.map((p) => p.id),
  });
  const blocks: string[] = [];
  for (const subject of subjects)
    blocks.push(
      (
        await send<{ id: string }>(request, 'post', 'assignments', {
          classGroupId: group.id,
          weeklyLessons: 1,
          participants: [{ teacherId: teacher.id, subjectId: subject.id }],
        })
      ).id,
    );
  const plan = await send<{ id: string; version: number }>(request, 'post', 'plannings', {
    name: (
      'Relatório extenso ' +
      suffix +
      ' com identificação longa para conferência de cabeçalhos repetidos '
    )
      .padEnd(100, 'x')
      .slice(0, 100),
    year: 2028,
  });
  const revisionId = planningDetailSchema.parse(
    await (await request.get(`/api/v1/plannings/${plan.id}`)).json(),
  ).revisions[0]?.id;
  let version = plan.version;
  for (const [index, blockId] of blocks.entries())
    version = (
      await send<{ version: number }>(request, 'post', `plannings/${plan.id}/grid/operations`, {
        version,
        revisionId,
        operation: {
          type: 'place',
          slot: {
            kind: 'lesson',
            entityId: blockId,
            weekday: 1,
            periodId: shift.periods[index]?.id,
          },
        },
      })
    ).version;
  await send(request, 'put', `plannings/${plan.id}/revisions/${revisionId}/name`, {
    version,
    name: 'Revisão inventada para conferir cabeçalhos longos e paginação '.padEnd(100, 'x'),
  });
  await page.goto(`/planejamentos/${plan.id}/impressoes?revisao=${revisionId}`);
  await expect(page.getByLabel('Turma para imprimir', { exact: true })).toBeVisible();
  await page.getByLabel('Turma para imprimir', { exact: true }).selectOption(group.id);
  await expect(page.getByRole('button', { name: 'Imprimir / salvar PDF' })).toBeEnabled();
  const pages = await pdfPages(
    await page.pdf({
      path: test.info().outputPath('paginacao.pdf'),
      preferCSSPageSize: true,
      printBackground: true,
    }),
  );
  expect(pages.length).toBeGreaterThan(1);
  for (const [index, text] of pages.entries()) {
    expect(text).toContain('Relatório extenso ' + suffix);
    expect(text).toContain('Revisão 1');
    expect(text).toContain('RASCUNHO');
    expect(text).toContain('Segunda');
    expect(text).toContain('Sexta');
    expect(text).toContain('Turma paginação ' + suffix);
    expect(text).toContain('Página ' + (index + 1));
  }
  const joined = pages.join(' ').replace(/\s+/g, '');
  for (const subject of subjects) expect(joined).toContain(subject.name.replace(/\s+/g, ''));
});
