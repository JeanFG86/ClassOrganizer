import type { ClassGroupRepository } from '../ports/class-group-repository.ts';
export type { ClassGroupRepository } from '../ports/class-group-repository.ts';
import { ClassGroupEntity } from '../../domain/class-group.ts';

import { compareNames } from '../../../../shared/names.ts';
import type { Clock, IdGenerator } from '../../../../shared/ports.ts';
import { assertVersion } from '../../../../shared/versioning.ts';
import type { VersionedRef } from '../../../../shared/versioning.ts';
import {
  ClassGroupNameAlreadyInUseError,
  ClassGroupNotFoundError,
} from '../../domain/class-group.ts';
import type { ClassGroup } from '../../domain/class-group.ts';
import { ShiftNotFoundError } from '../../domain/shift.ts';
import type { ShiftRepository } from '../ports/shift-repository.ts';

async function loadForChange(
  classGroups: ClassGroupRepository,
  ref: VersionedRef,
): Promise<ClassGroup> {
  const classGroup = await classGroups.findById(ref.id);
  if (!classGroup) {
    throw new ClassGroupNotFoundError();
  }
  assertVersion(classGroup.version, ref.version);
  return classGroup;
}

export type RegisterClassGroupDependencies = {
  classGroups: ClassGroupRepository;
  clock: Clock;
  ids: IdGenerator;
};
export class RegisterClassGroup {
  readonly #deps: RegisterClassGroupDependencies;
  constructor(deps: RegisterClassGroupDependencies) {
    this.#deps = deps;
  }
  async execute(input: { name: string }): Promise<ClassGroup> {
    const deps = this.#deps;

    const classGroup = ClassGroupEntity.create({
      id: deps.ids.next(),
      name: input.name,
      createdAt: deps.clock.now(),
    }).snapshot();

    const existing = await deps.classGroups.findByNormalizedName(classGroup.normalizedName);

    if (existing) {
      throw new ClassGroupNameAlreadyInUseError(existing);
    }

    await deps.classGroups.add(classGroup);

    return classGroup;
  }
}

export type ListClassGroupsDependencies = { classGroups: ClassGroupRepository };
export class ListClassGroups {
  readonly #deps: ListClassGroupsDependencies;
  constructor(deps: ListClassGroupsDependencies) {
    this.#deps = deps;
  }
  async execute(): Promise<ClassGroup[]> {
    const { classGroups } = this.#deps;

    const all = await classGroups.listAll();

    return all.toSorted((a, b) => compareNames(a.name, b.name));
  }
}

export type UpdateClassGroupDependencies = { classGroups: ClassGroupRepository };
export class UpdateClassGroup {
  readonly #deps: UpdateClassGroupDependencies;
  constructor(deps: UpdateClassGroupDependencies) {
    this.#deps = deps;
  }
  async execute(input: VersionedRef & { name: string }) {
    const { classGroups } = this.#deps;

    const current = await loadForChange(classGroups, input);

    const renamed = ClassGroupEntity.reconstitute(current).rename(input.name).snapshot();

    const sameName = await classGroups.findByNormalizedName(renamed.normalizedName);

    if (sameName && sameName.id !== renamed.id) {
      throw new ClassGroupNameAlreadyInUseError(sameName);
    }

    return classGroups.update(renamed);
  }
}

export type ArchiveClassGroupDependencies = { classGroups: ClassGroupRepository; clock: Clock };
export class ArchiveClassGroup {
  readonly #deps: ArchiveClassGroupDependencies;
  constructor(deps: ArchiveClassGroupDependencies) {
    this.#deps = deps;
  }
  async execute(ref: VersionedRef): Promise<ClassGroup> {
    const deps = this.#deps;

    const current = await loadForChange(deps.classGroups, ref);

    if (current.archivedAt) {
      return current;
    }

    return deps.classGroups.update(
      ClassGroupEntity.reconstitute(current).archive(deps.clock.now()).snapshot(),
    );
  }
}

export type RestoreClassGroupDependencies = { classGroups: ClassGroupRepository };
export class RestoreClassGroup {
  readonly #deps: RestoreClassGroupDependencies;
  constructor(deps: RestoreClassGroupDependencies) {
    this.#deps = deps;
  }
  async execute(ref: VersionedRef): Promise<ClassGroup> {
    const { classGroups } = this.#deps;

    const current = await loadForChange(classGroups, ref);

    if (!current.archivedAt) {
      return current;
    }

    return classGroups.update(ClassGroupEntity.reconstitute(current).restore().snapshot());
  }
}

export type ChangeClassGroupScheduleDependencies = {
  classGroups: ClassGroupRepository;
  shifts: ShiftRepository;
};
export class ChangeClassGroupSchedule {
  readonly #deps: ChangeClassGroupScheduleDependencies;
  constructor(deps: ChangeClassGroupScheduleDependencies) {
    this.#deps = deps;
  }
  async execute(
    input: VersionedRef & { shiftId: string | null; periodIds: readonly string[] },
  ): Promise<ClassGroup> {
    const deps = this.#deps;

    const current = await loadForChange(deps.classGroups, input);

    let shift = null;

    if (input.shiftId !== null) {
      shift = await deps.shifts.findById(input.shiftId);
      if (!shift) {
        throw new ShiftNotFoundError();
      }
    }

    return deps.classGroups.update(
      ClassGroupEntity.reconstitute(current).schedule(shift, input.periodIds).snapshot(),
    );
  }
}
