import {
  ShiftEntity,
  PeriodInUseError,
  ShiftInUseError,
  ShiftNameAlreadyInUseError,
  ShiftNotFoundError,
  removedPeriodIds,
} from '../../domain/shift.ts';

import { compareNames } from '../../../../shared/names.ts';
import type { Clock, IdGenerator } from '../../../../shared/ports.ts';
import { assertVersion } from '../../../../shared/versioning.ts';
import type { VersionedRef } from '../../../../shared/versioning.ts';
import type { PeriodInput, Shift } from '../../domain/shift.ts';
import type { ClassGroupRepository } from '../ports/class-group-repository.ts';
import type { ShiftRepository } from '../ports/shift-repository.ts';

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

export type RegisterShiftDependencies = {
  shifts: ShiftRepository;
  clock: Clock;
  ids: IdGenerator;
};
export class RegisterShift {
  readonly #deps: RegisterShiftDependencies;
  constructor(deps: RegisterShiftDependencies) {
    this.#deps = deps;
  }
  async execute(input: { name: string; periods: readonly PeriodInput[] }): Promise<Shift> {
    const deps = this.#deps;

    const shift = ShiftEntity.create(
      {
        id: deps.ids.next(),
        name: input.name,
        periods: input.periods,
        createdAt: deps.clock.now(),
      },
      deps.ids,
    ).snapshot();

    await assertNameAvailable(deps.shifts, shift);

    await deps.shifts.add(shift);

    return shift;
  }
}

/** Ordena pelo início do dia (manhã, tarde, noite) e, no empate, pelo nome. */
export type ListShiftsDependencies = { shifts: ShiftRepository };
export class ListShifts {
  readonly #deps: ListShiftsDependencies;
  constructor(deps: ListShiftsDependencies) {
    this.#deps = deps;
  }
  async execute(): Promise<Shift[]> {
    const { shifts } = this.#deps;

    const all = await shifts.listAll();

    return all.toSorted(
      (a, b) =>
        (a.periods[0]?.startMinute ?? 0) - (b.periods[0]?.startMinute ?? 0) ||
        compareNames(a.name, b.name),
    );
  }
}

export type UpdateShiftDependencies = {
  shifts: ShiftRepository;
  classGroups: ClassGroupRepository;
  ids: IdGenerator;
};
export class UpdateShift {
  readonly #deps: UpdateShiftDependencies;
  constructor(deps: UpdateShiftDependencies) {
    this.#deps = deps;
  }
  async execute(
    input: VersionedRef & { name: string; periods: readonly PeriodInput[] },
  ): Promise<Shift> {
    const deps = this.#deps;

    const current = await loadForChange(deps.shifts, input);

    const changed = ShiftEntity.reconstitute(current).change(input, deps.ids).snapshot();

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
  }
}

export type ArchiveShiftDependencies = {
  shifts: ShiftRepository;
  classGroups: ClassGroupRepository;
  clock: Clock;
};
export class ArchiveShift {
  readonly #deps: ArchiveShiftDependencies;
  constructor(deps: ArchiveShiftDependencies) {
    this.#deps = deps;
  }
  async execute(ref: VersionedRef): Promise<Shift> {
    const deps = this.#deps;

    const current = await loadForChange(deps.shifts, ref);

    if (current.archivedAt) {
      return current;
    }

    const active = (await deps.classGroups.findByShift(current.id)).filter((c) => !c.archivedAt);

    if (active.length > 0) {
      throw new ShiftInUseError(active.map((c) => c.name));
    }

    return deps.shifts.update(
      ShiftEntity.reconstitute(current).archive(deps.clock.now()).snapshot(),
    );
  }
}

export type RestoreShiftDependencies = { shifts: ShiftRepository };
export class RestoreShift {
  readonly #deps: RestoreShiftDependencies;
  constructor(deps: RestoreShiftDependencies) {
    this.#deps = deps;
  }
  async execute(ref: VersionedRef): Promise<Shift> {
    const { shifts } = this.#deps;

    const current = await loadForChange(shifts, ref);

    if (!current.archivedAt) {
      return current;
    }

    return shifts.update(ShiftEntity.reconstitute(current).restore().snapshot());
  }
}
