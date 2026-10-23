import { compareNames } from '../../../shared/names.ts';
import type { Clock, IdGenerator } from '../../../shared/ports.ts';
import { assertVersion } from '../../../shared/versioning.ts';
import type { VersionedRef } from '../../../shared/versioning.ts';
import {
  PeriodInUseError,
  ShiftInUseError,
  ShiftNameAlreadyInUseError,
  ShiftNotFoundError,
  changeShift,
  createShift,
  removedPeriodIds,
} from '../domain/shift.ts';
import type { PeriodInput, Shift } from '../domain/shift.ts';
import type { ClassGroupRepository } from './class-groups.ts';
import type { ShiftRepository } from './shift-repository.ts';

async function loadForChange(shifts: ShiftRepository, ref: VersionedRef): Promise<Shift> {
  const shift = await shifts.findById(ref.id);
  if (!shift) {
    throw new ShiftNotFoundError();
  }
  assertVersion(shift.version, ref.version);
  return shift;
}

async function assertNameAvailable(shifts: ShiftRepository, shift: Shift): Promise<void> {
  const sameName = await shifts.findByNormalizedName(shift.normalizedName);
  if (sameName && sameName.id !== shift.id) {
    throw new ShiftNameAlreadyInUseError(sameName);
  }
}

export function makeRegisterShift(deps: {
  shifts: ShiftRepository;
  clock: Clock;
  ids: IdGenerator;
}) {
  return async function registerShift(input: {
    name: string;
    periods: readonly PeriodInput[];
  }): Promise<Shift> {
    const shift = createShift(
      {
        id: deps.ids.next(),
        name: input.name,
        periods: input.periods,
        createdAt: deps.clock.now(),
      },
      deps.ids,
    );
    await assertNameAvailable(deps.shifts, shift);
    await deps.shifts.add(shift);
    return shift;
  };
}

/** Ordena pelo início do dia (manhã, tarde, noite) e, no empate, pelo nome. */
export function makeListShifts({ shifts }: { shifts: ShiftRepository }) {
  return async function listShifts(): Promise<Shift[]> {
    const all = await shifts.listAll();
    return all.toSorted(
      (a, b) =>
        (a.periods[0]?.startMinute ?? 0) - (b.periods[0]?.startMinute ?? 0) ||
        compareNames(a.name, b.name),
    );
  };
}

export function makeUpdateShift(deps: {
  shifts: ShiftRepository;
  classGroups: ClassGroupRepository;
  ids: IdGenerator;
}) {
  return async function updateShift(
    input: VersionedRef & { name: string; periods: readonly PeriodInput[] },
  ): Promise<Shift> {
    const current = await loadForChange(deps.shifts, input);
    const changed = changeShift(current, input, deps.ids);
    await assertNameAvailable(deps.shifts, changed);

    // Mensagem antecipada com o nome das turmas; o banco também impede (FK da aula da turma).
    const removed = removedPeriodIds(current, changed);
    if (removed.size > 0) {
      const users = (await deps.classGroups.findByShift(current.id)).filter((c) =>
        c.periodIds.some((id) => removed.has(id)),
      );
      if (users.length > 0) {
        throw new PeriodInUseError(users.map((c) => c.name));
      }
    }

    return deps.shifts.update(changed);
  };
}

export function makeArchiveShift(deps: {
  shifts: ShiftRepository;
  classGroups: ClassGroupRepository;
  clock: Clock;
}) {
  return async function archive(ref: VersionedRef): Promise<Shift> {
    const current = await loadForChange(deps.shifts, ref);
    if (current.archivedAt) {
      return current;
    }
    const active = (await deps.classGroups.findByShift(current.id)).filter((c) => !c.archivedAt);
    if (active.length > 0) {
      throw new ShiftInUseError(active.map((c) => c.name));
    }
    return deps.shifts.update({ ...current, archivedAt: deps.clock.now() });
  };
}

export function makeRestoreShift({ shifts }: { shifts: ShiftRepository }) {
  return async function restore(ref: VersionedRef): Promise<Shift> {
    const current = await loadForChange(shifts, ref);
    if (!current.archivedAt) {
      return current;
    }
    return shifts.update({ ...current, archivedAt: null });
  };
}

export type RegisterShift = ReturnType<typeof makeRegisterShift>;
export type ListShifts = ReturnType<typeof makeListShifts>;
export type UpdateShift = ReturnType<typeof makeUpdateShift>;
export type ArchiveShift = ReturnType<typeof makeArchiveShift>;
export type RestoreShift = ReturnType<typeof makeRestoreShift>;
