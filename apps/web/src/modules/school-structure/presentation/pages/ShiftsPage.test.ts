import type { ClassGroupDto, ShiftDto } from '@classorganizer/contracts';
import { RouterLinkStub, flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../../../shared/application/api-error.ts';
import { classGroupsApiKey } from '../class-groups-key.ts';
import { type ClassGroupsApi } from '../../application/class-groups-api.ts';
import { shiftsApiKey } from '../shifts-key.ts';
import { type ShiftsApi } from '../../application/shifts-api.ts';
import ShiftsPage from './ShiftsPage.vue';

const createdAt = '2026-02-01T12:00:00.000Z';
const base = { createdAt, archivedAt: null, version: 1 };

const manha: ShiftDto = {
  id: 'manha',
  name: 'Manhã',
  periods: [
    { id: 'p1', start: '07:30', end: '08:20' },
    { id: 'p2', start: '08:20', end: '09:10' },
    { id: 'p3', start: '09:30', end: '10:20' },
  ],
  ...base,
};
const tarde: ShiftDto = {
  id: 'tarde',
  name: 'Tarde',
  periods: [{ id: 't1', start: '13:00', end: '13:50' }],
  ...base,
};

const turma = (id: string, name: string, shiftId: string | null, periodIds: string[]) =>
  ({ id, name, shiftId, periodIds, ...base }) satisfies ClassGroupDto;

function fakeShiftsApi(initial: ShiftDto[]) {
  const items = [...initial];
  const replace = (next: ShiftDto) => {
    items[items.findIndex((s) => s.id === next.id)] = next;
    return next;
  };
  const find = (id: string) => items.find((s) => s.id === id) as ShiftDto;
  return {
    items,
    list: vi.fn(async () => [...items]),
    register: vi.fn<ShiftsApi['register']>(async ({ name, periods }) => {
      const created: ShiftDto = {
        id: `s${items.length + 1}`,
        name,
        periods: periods.map((p, i) => ({ id: `n${i + 1}`, ...p })),
        ...base,
      };
      items.push(created);
      return created;
    }),
    update: vi.fn<ShiftsApi['update']>(async (id, { name, periods }) => {
      const current = find(id);
      return replace({
        ...current,
        name,
        periods: periods.map((p, i) => ({ id: p.id ?? `new${i}`, start: p.start, end: p.end })),
        version: current.version + 1,
      });
    }),
    archive: vi.fn<ShiftsApi['archive']>(async (id) => {
      const current = find(id);
      return replace({ ...current, archivedAt: createdAt, version: current.version + 1 });
    }),
    restore: vi.fn<ShiftsApi['restore']>(async (id) => {
      const current = find(id);
      return replace({ ...current, archivedAt: null, version: current.version + 1 });
    }),
  } satisfies ShiftsApi & { items: ShiftDto[] };
}

function fakeClassGroupsApi(initial: ClassGroupDto[]) {
  const items = [...initial];
  return {
    items,
    list: vi.fn(async () => [...items]),
    register: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    changeSchedule: vi.fn<ClassGroupsApi['changeSchedule']>(async (id, { shiftId, periodIds }) => {
      const index = items.findIndex((c) => c.id === id);
      const current = items[index] as ClassGroupDto;
      const next = { ...current, shiftId, periodIds, version: current.version + 1 };
      items[index] = next;
      return next;
    }),
  } satisfies ClassGroupsApi & { items: ClassGroupDto[] };
}

async function mountPage(shiftsApi: ShiftsApi, classGroupsApi: ClassGroupsApi) {
  const wrapper = mount(ShiftsPage, {
    global: {
      provide: {
        [shiftsApiKey as symbol]: shiftsApi,
        [classGroupsApiKey as symbol]: classGroupsApi,
      },
      stubs: { RouterLink: RouterLinkStub },
    },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>;
const card = (wrapper: Wrapper, name: string) =>
  wrapper.get(`section[aria-labelledby="shift-${name}-title"]`);
const checkbox = (wrapper: Wrapper, label: string) =>
  wrapper.get<HTMLInputElement>(`input[aria-label="${label}"]`);

describe('ShiftsPage', () => {
  it('cadastra turno, sugerindo a próxima aula e mostrando o intervalo', async () => {
    const shiftsApi = fakeShiftsApi([]);
    const wrapper = await mountPage(shiftsApi, fakeClassGroupsApi([]));
    expect(wrapper.text()).toContain('Nenhum turno cadastrado ainda.');

    await wrapper.get('#shift-name').setValue('Manhã');
    await wrapper.get('#new-shift-start-0').setValue('07:30');
    await wrapper.get('#new-shift-end-0').setValue('08:20');
    const addButton = wrapper.findAll('button').find((b) => b.text() === 'Adicionar aula');
    await addButton?.trigger('click');

    // A próxima aula começa no fim da anterior e tem a mesma duração.
    expect(wrapper.get<HTMLInputElement>('#new-shift-start-1').element.value).toBe('08:20');
    expect(wrapper.get<HTMLInputElement>('#new-shift-end-1').element.value).toBe('09:10');

    await addButton?.trigger('click');
    await wrapper.get('#new-shift-start-2').setValue('09:30');
    await wrapper.get('#new-shift-end-2').setValue('10:20');
    expect(wrapper.get('.periods-editor').text()).toContain('Intervalo de 20 min');

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(shiftsApi.register).toHaveBeenCalledWith({
      name: 'Manhã',
      periods: [
        { start: '07:30', end: '08:20' },
        { start: '08:20', end: '09:10' },
        { start: '09:30', end: '10:20' },
      ],
    });
    expect(wrapper.get('[role="status"]').text()).toBe('Turno "Manhã" cadastrado.');
    expect(card(wrapper, 's1').text()).toContain('3 aulas · 07:30–10:20');
    expect(wrapper.get<HTMLInputElement>('#shift-name').element.value).toBe('');
  });

  it('avisa antes de enviar quando falta o nome ou um horário', async () => {
    const shiftsApi = fakeShiftsApi([]);
    const wrapper = await mountPage(shiftsApi, fakeClassGroupsApi([]));

    await wrapper.get('form').trigger('submit');
    expect(wrapper.get('[role="alert"]').text()).toBe('Informe o nome do turno.');

    await wrapper.get('#shift-name').setValue('Manhã');
    await wrapper.get('#new-shift-start-0').setValue('07:30');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Informe o início e o fim de todas as aulas.',
    );
    expect(shiftsApi.register).not.toHaveBeenCalled();
  });

  it('mostra as aulas e as turmas sem turno', async () => {
    const wrapper = await mountPage(
      fakeShiftsApi([manha]),
      fakeClassGroupsApi([turma('c1', '9º B', null, []), turma('c2', '9º A', null, [])]),
    );

    const rows = card(wrapper, 'manha')
      .get('table[aria-label="Aulas do turno Manhã"]')
      .findAll('tr')
      .map((r) => r.text());
    expect(rows).toEqual([
      '1ª aula07:30 às 08:20',
      '2ª aula08:20 às 09:10',
      'Intervalo de 20 min',
      '3ª aula09:30 às 10:20',
    ]);
    expect(wrapper.get('section[aria-labelledby="without-shift-title"]').text()).toContain(
      '9º A, 9º B',
    );
  });

  it('marca e desmarca as aulas de cada turma', async () => {
    const classGroupsApi = fakeClassGroupsApi([turma('c1', '8º A', 'manha', ['p1', 'p2'])]);
    const wrapper = await mountPage(fakeShiftsApi([manha]), classGroupsApi);

    expect(checkbox(wrapper, '8º A: 1ª aula (07:30–08:20)').element.checked).toBe(true);
    expect(checkbox(wrapper, '8º A: 3ª aula (09:30–10:20)').element.checked).toBe(false);

    await checkbox(wrapper, '8º A: 3ª aula (09:30–10:20)').setValue(true);
    await flushPromises();
    expect(classGroupsApi.changeSchedule).toHaveBeenLastCalledWith('c1', {
      shiftId: 'manha',
      periodIds: ['p1', 'p2', 'p3'],
      version: 1,
    });

    await checkbox(wrapper, '8º A: 1ª aula (07:30–08:20)').setValue(false);
    await flushPromises();
    expect(classGroupsApi.changeSchedule).toHaveBeenLastCalledWith('c1', {
      shiftId: 'manha',
      periodIds: ['p2', 'p3'],
      version: 2,
    });
    expect(checkbox(wrapper, '8º A: 1ª aula (07:30–08:20)').element.checked).toBe(false);
  });

  it('não deixa a turma sem nenhuma aula', async () => {
    const classGroupsApi = fakeClassGroupsApi([turma('c1', '8º A', 'manha', ['p1'])]);
    const wrapper = await mountPage(fakeShiftsApi([manha]), classGroupsApi);

    await checkbox(wrapper, '8º A: 1ª aula (07:30–08:20)').setValue(false);
    await flushPromises();

    expect(classGroupsApi.changeSchedule).not.toHaveBeenCalled();
    expect(checkbox(wrapper, '8º A: 1ª aula (07:30–08:20)').element.checked).toBe(true);
    expect(card(wrapper, 'manha').get('[role="alert"]').text()).toContain(
      'A turma 8º A precisa ter pelo menos uma aula.',
    );
  });

  it('desfaz a marcação quando o servidor recusa', async () => {
    const classGroupsApi = fakeClassGroupsApi([turma('c1', '8º A', 'manha', ['p1'])]);
    classGroupsApi.changeSchedule.mockRejectedValueOnce(
      new ApiRequestError('class_group.invalid_schedule', 'O turno "Manhã" está arquivado.', 400),
    );
    const wrapper = await mountPage(fakeShiftsApi([manha]), classGroupsApi);

    await checkbox(wrapper, '8º A: 2ª aula (08:20–09:10)').setValue(true);
    await flushPromises();

    expect(checkbox(wrapper, '8º A: 2ª aula (08:20–09:10)').element.checked).toBe(false);
    expect(card(wrapper, 'manha').get('[role="alert"]').text()).toBe(
      'O turno "Manhã" está arquivado.',
    );
  });

  it('adiciona turma com todas as aulas, inclusive vinda de outro turno, e tira do turno', async () => {
    const classGroupsApi = fakeClassGroupsApi([
      turma('c1', '8º A', null, []),
      turma('c2', '6º A', 'tarde', ['t1']),
    ]);
    const wrapper = await mountPage(fakeShiftsApi([manha, tarde]), classGroupsApi);

    const select = card(wrapper, 'manha').get('select');
    expect(select.findAll('option').map((o) => o.text())).toEqual([
      'Adicionar turma…',
      '6º A (turno atual: Tarde)',
      '8º A',
    ]);

    await select.setValue('c1');
    await card(wrapper, 'manha').get('form.add-class').trigger('submit');
    await flushPromises();
    expect(classGroupsApi.changeSchedule).toHaveBeenLastCalledWith('c1', {
      shiftId: 'manha',
      periodIds: ['p1', 'p2', 'p3'],
      version: 1,
    });
    expect(card(wrapper, 'manha').text()).toContain('8º A (3)');

    await card(wrapper, 'manha').get('button[aria-label="Tirar 8º A do turno"]').trigger('click');
    await flushPromises();
    expect(classGroupsApi.changeSchedule).toHaveBeenLastCalledWith('c1', {
      shiftId: null,
      periodIds: [],
      version: 2,
    });
    expect(card(wrapper, 'manha').text()).toContain('Nenhuma turma neste turno ainda.');
  });

  it('edita o turno mantendo a identidade das aulas', async () => {
    const shiftsApi = fakeShiftsApi([manha]);
    const wrapper = await mountPage(shiftsApi, fakeClassGroupsApi([]));

    await card(wrapper, 'manha').get('button[aria-label="Editar o turno Manhã"]').trigger('click');
    await wrapper.get('#shift-manha-name').setValue('Matutino');
    await wrapper.get('#shift-manha-edit-end-0').setValue('08:15');
    await wrapper.get('button[aria-label="Remover 3ª aula"]').trigger('click');
    await card(wrapper, 'manha').get('form').trigger('submit');
    await flushPromises();

    expect(shiftsApi.update).toHaveBeenCalledWith('manha', {
      name: 'Matutino',
      periods: [
        { id: 'p1', start: '07:30', end: '08:15' },
        { id: 'p2', start: '08:20', end: '09:10' },
      ],
      version: 1,
    });
    expect(wrapper.get('[role="status"]').text()).toBe('Turno "Matutino" salvo.');
    expect(card(wrapper, 'manha').find('form:not(.add-class)').exists()).toBe(false);
  });

  it('mostra no turno o motivo de uma alteração recusada e mantém a edição', async () => {
    const shiftsApi = fakeShiftsApi([manha]);
    shiftsApi.update.mockRejectedValueOnce(
      new ApiRequestError(
        'shift.period_in_use',
        'A aula removida está marcada nas turmas 8º A. Desmarque-a nessas turmas antes de removê-la.',
        409,
      ),
    );
    const wrapper = await mountPage(shiftsApi, fakeClassGroupsApi([]));

    await card(wrapper, 'manha').get('button[aria-label="Editar o turno Manhã"]').trigger('click');
    await wrapper.get('button[aria-label="Remover 3ª aula"]').trigger('click');
    await card(wrapper, 'manha').get('form').trigger('submit');
    await flushPromises();

    expect(card(wrapper, 'manha').get('[role="alert"]').text()).toContain(
      'A aula removida está marcada nas turmas 8º A.',
    );
    expect(wrapper.find('#shift-manha-name').exists()).toBe(true);
  });

  it('arquiva e restaura o turno', async () => {
    const shiftsApi = fakeShiftsApi([manha]);
    const wrapper = await mountPage(shiftsApi, fakeClassGroupsApi([]));

    await card(wrapper, 'manha')
      .get('button[aria-label="Arquivar o turno Manhã"]')
      .trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toBe('Turno "Manhã" arquivado.');
    expect(wrapper.get('ul[aria-label="Turnos arquivados"]').text()).toContain('Manhã');

    await wrapper.get('button[aria-label="Restaurar o turno Manhã"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toBe('Turno "Manhã" restaurado.');
    expect(wrapper.find('section[aria-labelledby="shift-manha-title"]').exists()).toBe(true);
  });
});
