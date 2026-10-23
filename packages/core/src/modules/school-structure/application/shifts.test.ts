import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryClassGroupRepository,
  InMemoryShiftRepository,
} from '../../../testing/in-memory-repositories.ts';
import { StaleVersionError } from '../../../shared/versioning.ts';
import { InvalidClassScheduleError } from '../domain/class-group.ts';
import {
  InvalidPeriodsError,
  InvalidShiftNameError,
  PeriodInUseError,
  ShiftInUseError,
  ShiftNotFoundError,
} from '../domain/shift.ts';
import type { PeriodInput } from '../domain/shift.ts';
import {
  makeArchiveClassGroup,
  makeChangeClassGroupSchedule,
  makeRegisterClassGroup,
} from './class-groups.ts';
import {
  makeArchiveShift,
  makeListShifts,
  makeRegisterShift,
  makeRestoreShift,
  makeUpdateShift,
} from './shifts.ts';

const now = new Date('2026-02-01T12:00:00Z');

/** "07:30" → 450. */
const t = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const period = (start: string, end: string, id?: string): PeriodInput => ({
  id,
  startMinute: t(start),
  endMinute: t(end),
});
const morning = [period('07:30', '08:20'), period('08:20', '09:10'), period('09:30', '10:20')];

describe('turnos e aulas', () => {
  let shifts: InMemoryShiftRepository;
  let classGroups: InMemoryClassGroupRepository;
  let registerShift: ReturnType<typeof makeRegisterShift>;
  let updateShift: ReturnType<typeof makeUpdateShift>;
  let archiveShift: ReturnType<typeof makeArchiveShift>;
  let restoreShift: ReturnType<typeof makeRestoreShift>;
  let registerClassGroup: ReturnType<typeof makeRegisterClassGroup>;
  let archiveClassGroup: ReturnType<typeof makeArchiveClassGroup>;
  let schedule: ReturnType<typeof makeChangeClassGroupSchedule>;

  beforeEach(() => {
    shifts = new InMemoryShiftRepository();
    classGroups = new InMemoryClassGroupRepository();
    const clock = { now: () => now };
    let sequence = 0;
    const ids = { next: () => `id-${++sequence}` };
    registerShift = makeRegisterShift({ shifts, clock, ids });
    updateShift = makeUpdateShift({ shifts, classGroups, ids });
    archiveShift = makeArchiveShift({ shifts, classGroups, clock });
    restoreShift = makeRestoreShift({ shifts });
    registerClassGroup = makeRegisterClassGroup({ classGroups, clock, ids });
    archiveClassGroup = makeArchiveClassGroup({ classGroups, clock });
    schedule = makeChangeClassGroupSchedule({ classGroups, shifts });
  });

  describe('cadastro do turno', () => {
    it('cadastra com nome limpo e aulas ordenadas pelo início', async () => {
      const shift = await registerShift({
        name: '  Manhã ',
        periods: [period('09:30', '10:20'), period('07:30', '08:20')],
      });

      expect(shift).toEqual({
        id: 'id-1',
        name: 'Manhã',
        normalizedName: 'manha',
        periods: [
          { id: 'id-3', startMinute: t('07:30'), endMinute: t('08:20') },
          { id: 'id-2', startMinute: t('09:30'), endMinute: t('10:20') },
        ],
        createdAt: now,
        archivedAt: null,
        version: 1,
      });
    });

    it.each(['', '   ', 'x'.repeat(41)])('rejeita nome inválido (%j)', async (name) => {
      await expect(registerShift({ name, periods: morning })).rejects.toThrow(
        InvalidShiftNameError,
      );
    });

    it('impede nome repetido, orientando a restaurar se estiver arquivado', async () => {
      const shift = await registerShift({ name: 'Manhã', periods: morning });
      await expect(registerShift({ name: 'MANHA', periods: morning })).rejects.toThrow(
        'Já existe um turno chamado "Manhã".',
      );

      await archiveShift({ id: shift.id, version: 1 });
      await expect(registerShift({ name: 'Manhã', periods: morning })).rejects.toThrow(
        /turno arquivado.*Restaure-o/,
      );
    });

    it.each([
      ['sem aulas', [], 'Informe pelo menos uma aula do turno.'],
      [
        'mais de 12 aulas',
        Array.from({ length: 13 }, (_, i) => ({ startMinute: i * 60, endMinute: i * 60 + 50 })),
        'Um turno pode ter no máximo 12 aulas.',
      ],
      [
        'horário fora do dia',
        [{ startMinute: -10, endMinute: 30 }],
        'Informe o início e o fim de todas as aulas.',
      ],
      [
        'fim antes do início',
        [period('08:20', '07:30')],
        'A aula que começa às 08:20 precisa terminar depois de começar (fim informado: 07:30).',
      ],
      [
        'fim igual ao início',
        [period('08:20', '08:20')],
        'A aula que começa às 08:20 precisa terminar depois de começar (fim informado: 08:20).',
      ],
      [
        'aulas sobrepostas',
        [period('07:30', '08:20'), period('08:10', '09:00')],
        'A 2ª aula (08:10–09:00) começa antes do fim da 1ª (07:30–08:20).',
      ],
    ])('rejeita aulas inválidas: %s', async (_case, periods, message) => {
      const error = await registerShift({ name: 'Manhã', periods }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(InvalidPeriodsError);
      expect((error as Error).message).toBe(message);
    });

    it('aceita aulas encostadas e intervalos entre elas', async () => {
      const shift = await registerShift({ name: 'Manhã', periods: morning });
      expect(shift.periods.map((p) => [p.startMinute, p.endMinute])).toEqual([
        [t('07:30'), t('08:20')],
        [t('08:20'), t('09:10')],
        [t('09:30'), t('10:20')],
      ]);
    });

    it('lista pelo início do dia', async () => {
      await registerShift({ name: 'Noite', periods: [period('18:30', '19:20')] });
      await registerShift({ name: 'Manhã', periods: morning });
      await registerShift({ name: 'Tarde', periods: [period('13:00', '13:50')] });

      const names = (await makeListShifts({ shifts })()).map((s) => s.name);

      expect(names).toEqual(['Manhã', 'Tarde', 'Noite']);
    });
  });

  describe('alteração do turno', () => {
    it('mantém a identidade das aulas informadas, cria as novas e remove as ausentes', async () => {
      const shift = await registerShift({ name: 'Manhã', periods: morning });
      const [first, second] = shift.periods;

      const updated = await updateShift({
        id: shift.id,
        version: 1,
        name: 'Manhã (EM)',
        periods: [
          period('07:40', '08:30', first?.id),
          period('08:30', '09:20', second?.id),
          period('11:00', '11:50'),
        ],
      });

      expect(updated.name).toBe('Manhã (EM)');
      expect(updated.version).toBe(2);
      expect(updated.periods).toEqual([
        { id: first?.id, startMinute: t('07:40'), endMinute: t('08:30') },
        { id: second?.id, startMinute: t('08:30'), endMinute: t('09:20') },
        { id: 'id-5', startMinute: t('11:00'), endMinute: t('11:50') },
      ]);
    });

    it('recusa aula desconhecida ou repetida (tela desatualizada)', async () => {
      const shift = await registerShift({ name: 'Manhã', periods: morning });
      const id = shift.periods[0]?.id;

      for (const periods of [
        [period('07:30', '08:20', 'outra')],
        [period('07:30', '08:20', id), period('08:20', '09:10', id)],
      ]) {
        await expect(
          updateShift({ id: shift.id, version: 1, name: 'Manhã', periods }),
        ).rejects.toThrow('A lista de aulas está desatualizada.');
      }
    });

    it('impede remover aula marcada em turma, citando as turmas', async () => {
      const shift = await registerShift({ name: 'Manhã', periods: morning });
      const ids = shift.periods.map((p) => p.id);
      for (const name of ['6º B', '6º A']) {
        const turma = await registerClassGroup({ name });
        await schedule({ id: turma.id, version: 1, shiftId: shift.id, periodIds: ids });
      }

      const keepTwo = shift.periods.slice(0, 2).map((p) => ({ ...p }));
      await expect(
        updateShift({ id: shift.id, version: 1, name: 'Manhã', periods: keepTwo }),
      ).rejects.toThrow(new PeriodInUseError(['6º A', '6º B']).message);
      expect(new PeriodInUseError(['6º B', '6º A']).message).toBe(
        'A aula removida está marcada nas turmas 6º A, 6º B. ' +
          'Desmarque-a nessas turmas antes de removê-la.',
      );
    });

    it('permite remover aula que nenhuma turma usa', async () => {
      const shift = await registerShift({ name: 'Manhã', periods: morning });
      const turma = await registerClassGroup({ name: '6º A' });
      const firstTwo = shift.periods.slice(0, 2);
      await schedule({
        id: turma.id,
        version: 1,
        shiftId: shift.id,
        periodIds: firstTwo.map((p) => p.id),
      });

      const updated = await updateShift({
        id: shift.id,
        version: 1,
        name: 'Manhã',
        periods: firstTwo,
      });

      expect(updated.periods).toHaveLength(2);
    });

    it('usa controle de versão e informa turno inexistente', async () => {
      const shift = await registerShift({ name: 'Manhã', periods: morning });
      await updateShift({ id: shift.id, version: 1, name: 'Matutino', periods: morning });

      await expect(
        updateShift({ id: shift.id, version: 1, name: 'Manhã', periods: morning }),
      ).rejects.toThrow(StaleVersionError);
      await expect(
        updateShift({ id: 'nada', version: 1, name: 'Manhã', periods: morning }),
      ).rejects.toThrow(ShiftNotFoundError);
    });

    it('impede renomear para o nome de outro turno', async () => {
      await registerShift({ name: 'Manhã', periods: morning });
      const tarde = await registerShift({ name: 'Tarde', periods: [period('13:00', '13:50')] });

      await expect(
        updateShift({ id: tarde.id, version: 1, name: 'manhã', periods: tarde.periods }),
      ).rejects.toThrow('Já existe um turno chamado "Manhã".');
    });
  });

  describe('arquivamento do turno', () => {
    it('impede arquivar com turmas ativas; turmas arquivadas não impedem', async () => {
      const shift = await registerShift({ name: 'Manhã', periods: morning });
      const turma = await registerClassGroup({ name: '6º A' });
      await schedule({
        id: turma.id,
        version: 1,
        shiftId: shift.id,
        periodIds: [shift.periods[0]?.id ?? ''],
      });

      await expect(archiveShift({ id: shift.id, version: 1 })).rejects.toThrow(
        new ShiftInUseError(['6º A']),
      );
      expect(new ShiftInUseError(['6º A']).message).toBe(
        'O turno tem as turmas 6º A. Tire essas turmas do turno antes de arquivá-lo.',
      );

      await archiveClassGroup({ id: turma.id, version: 2 });
      const archived = await archiveShift({ id: shift.id, version: 1 });
      expect(archived.archivedAt).toEqual(now);

      const restored = await restoreShift({ id: shift.id, version: 2 });
      expect(restored).toMatchObject({ archivedAt: null, version: 3 });
    });
  });

  describe('turno e aulas da turma', () => {
    it('liga a turma ao turno com as aulas escolhidas, na ordem do turno', async () => {
      const shift = await registerShift({ name: 'Manhã', periods: morning });
      const [p1, p2, p3] = shift.periods.map((p) => p.id);
      const turma = await registerClassGroup({ name: '8º A' });

      const scheduled = await schedule({
        id: turma.id,
        version: 1,
        shiftId: shift.id,
        periodIds: [p3 ?? '', p1 ?? '', p1 ?? ''],
      });

      expect(scheduled).toMatchObject({ shiftId: shift.id, periodIds: [p1, p3], version: 2 });
      expect(p2).toBeDefined();
    });

    it('tira a turma do turno', async () => {
      const shift = await registerShift({ name: 'Manhã', periods: morning });
      const turma = await registerClassGroup({ name: '8º A' });
      await schedule({
        id: turma.id,
        version: 1,
        shiftId: shift.id,
        periodIds: [shift.periods[0]?.id ?? ''],
      });

      const removed = await schedule({ id: turma.id, version: 2, shiftId: null, periodIds: [] });

      expect(removed).toMatchObject({ shiftId: null, periodIds: [], version: 3 });
    });

    it.each([
      ['sem aulas', () => [], 'Escolha pelo menos uma aula do turno para a turma.'],
      ['aula de outro turno', () => ['outra'], 'Uma das aulas escolhidas não pertence ao turno.'],
    ])('recusa %s', async (_case, periodIds, message) => {
      const shift = await registerShift({ name: 'Manhã', periods: morning });
      const turma = await registerClassGroup({ name: '8º A' });

      const error = await schedule({
        id: turma.id,
        version: 1,
        shiftId: shift.id,
        periodIds: periodIds(),
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InvalidClassScheduleError);
      expect((error as Error).message).toContain(message);
    });

    it('recusa turno arquivado ou inexistente e versão antiga', async () => {
      const shift = await registerShift({ name: 'Manhã', periods: morning });
      const ids = shift.periods.map((p) => p.id);
      const turma = await registerClassGroup({ name: '8º A' });
      await archiveShift({ id: shift.id, version: 1 });

      await expect(
        schedule({ id: turma.id, version: 1, shiftId: shift.id, periodIds: ids }),
      ).rejects.toThrow('O turno "Manhã" está arquivado.');
      await expect(
        schedule({ id: turma.id, version: 1, shiftId: 'nada', periodIds: ids }),
      ).rejects.toThrow(ShiftNotFoundError);

      await restoreShift({ id: shift.id, version: 2 });
      await schedule({ id: turma.id, version: 1, shiftId: shift.id, periodIds: ids });
      await expect(
        schedule({ id: turma.id, version: 1, shiftId: null, periodIds: [] }),
      ).rejects.toThrow(StaleVersionError);
    });
  });
});
