import type { TranslatedCatalog } from './catalog-translation.ts';
import type { GridOperation, GridSlot } from './grid.ts';

const DAY_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta'];

function clock(minute: number): string {
  return (
    String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0')
  );
}

/** Rótulos legíveis para o histórico; referências desconhecidas não interrompem o resumo. */
export function slotLabel(translated: TranslatedCatalog, slot: GridSlot): string {
  const { timetable } = translated;
  if (slot.kind === 'planning') {
    const teacher = timetable.teachers.find((t) => t.id === slot.entityId);
    return 'hora-atividade de ' + (teacher?.name ?? 'professor removido');
  }
  const assignment = timetable.assignments.find((a) => a.id === slot.entityId);
  if (!assignment) return 'aula de bloco removido';
  const subjects = [...new Set(assignment.participants.map((p) => p.subjectId))].map(
    (id) => timetable.subjects.find((s) => s.id === id)?.name ?? 'disciplina removida',
  );
  const classGroup = timetable.classGroups.find((c) => c.id === assignment.classGroupId);
  return subjects.join(' + ') + ' (' + (classGroup?.name ?? 'turma removida') + ')';
}

export function timeLabel(
  translated: TranslatedCatalog,
  time: Pick<GridSlot, 'weekday' | 'periodId'>,
): string {
  const period = translated.timetable.periods.find((p) => p.id === time.periodId);
  const shift = translated.shifts.find((s) => s.id === period?.shiftId);
  return (
    (DAY_NAMES[time.weekday - 1] ?? 'dia ' + time.weekday) +
    ', ' +
    (period ? clock(period.startMinute) + (shift ? ' (' + shift.name + ')' : '') : 'aula removida')
  );
}

export function describeOperation(translated: TranslatedCatalog, operation: GridOperation): string {
  const label = (slot: GridSlot) => slotLabel(translated, slot);
  const at = (time: Pick<GridSlot, 'weekday' | 'periodId'>) => timeLabel(translated, time);
  switch (operation.type) {
    case 'place':
      return 'Inseriu ' + label(operation.slot) + ' em ' + at(operation.slot) + '.';
    case 'remove':
      return 'Removeu ' + label(operation.slot) + ' de ' + at(operation.slot) + '.';
    case 'move':
      return (
        'Moveu ' +
        label(operation.slot) +
        ' de ' +
        at(operation.slot) +
        ' para ' +
        at(operation) +
        '.'
      );
    case 'swap':
      return (
        'Trocou ' +
        label(operation.first) +
        ' (' +
        at(operation.first) +
        ') com ' +
        label(operation.second) +
        ' (' +
        at(operation.second) +
        ').'
      );
    case 'pin':
      return (
        (operation.pinned ? 'Fixou ' : 'Desfixou ') +
        label(operation.slot) +
        ' em ' +
        at(operation.slot) +
        '.'
      );
  }
}
