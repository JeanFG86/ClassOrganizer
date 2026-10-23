import { compareNames } from '../../../shared/names.ts';
import type { Clock, IdGenerator } from '../../../shared/ports.ts';
import { assertVersion } from '../../../shared/versioning.ts';
import type { VersionedRef } from '../../../shared/versioning.ts';
import {
  ClassGroupNameAlreadyInUseError,
  ClassGroupNotFoundError,
  createClassGroup,
  renameClassGroup,
  scheduleClassGroup,
} from '../domain/class-group.ts';
import type { ClassGroup } from '../domain/class-group.ts';
import { ShiftNotFoundError } from '../domain/shift.ts';
import type { ShiftRepository } from './shift-repository.ts';

export interface ClassGroupRepository {
  findById(id: string): Promise<ClassGroup | null>;
  findByNormalizedName(normalizedName: string): Promise<ClassGroup | null>;
  /** Turmas (ativas e arquivadas) ligadas ao turno. */
  findByShift(shiftId: string): Promise<ClassGroup[]>;
  /** Deve lançar `ClassGroupNameAlreadyInUseError` em caso de nome duplicado concorrente. */
  add(classGroup: ClassGroup): Promise<void>;
  /**
   * Grava nome, situação, turno e aulas condicionado à versão; lança `StaleVersionError`
   * se outra alteração chegou antes.
   */
  update(classGroup: ClassGroup): Promise<ClassGroup>;
  listAll(): Promise<ClassGroup[]>;
}

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

export function makeRegisterClassGroup(deps: {
  classGroups: ClassGroupRepository;
  clock: Clock;
  ids: IdGenerator;
}) {
  return async function registerClassGroup(input: { name: string }): Promise<ClassGroup> {
    const classGroup = createClassGroup({
      id: deps.ids.next(),
      name: input.name,
      createdAt: deps.clock.now(),
    });

    const existing = await deps.classGroups.findByNormalizedName(classGroup.normalizedName);
    if (existing) {
      throw new ClassGroupNameAlreadyInUseError(existing);
    }

    await deps.classGroups.add(classGroup);
    return classGroup;
  };
}

export function makeListClassGroups({ classGroups }: { classGroups: ClassGroupRepository }) {
  return async function listClassGroups(): Promise<ClassGroup[]> {
    const all = await classGroups.listAll();
    return all.toSorted((a, b) => compareNames(a.name, b.name));
  };
}

export function makeUpdateClassGroup({ classGroups }: { classGroups: ClassGroupRepository }) {
  return async function updateClassGroup(input: VersionedRef & { name: string }) {
    const current = await loadForChange(classGroups, input);
    const renamed = renameClassGroup(current, input.name);

    const sameName = await classGroups.findByNormalizedName(renamed.normalizedName);
    if (sameName && sameName.id !== renamed.id) {
      throw new ClassGroupNameAlreadyInUseError(sameName);
    }

    return classGroups.update(renamed);
  };
}

export function makeArchiveClassGroup(deps: { classGroups: ClassGroupRepository; clock: Clock }) {
  return async function archive(ref: VersionedRef): Promise<ClassGroup> {
    const current = await loadForChange(deps.classGroups, ref);
    if (current.archivedAt) {
      return current;
    }
    return deps.classGroups.update({ ...current, archivedAt: deps.clock.now() });
  };
}

export function makeRestoreClassGroup({ classGroups }: { classGroups: ClassGroupRepository }) {
  return async function restore(ref: VersionedRef): Promise<ClassGroup> {
    const current = await loadForChange(classGroups, ref);
    if (!current.archivedAt) {
      return current;
    }
    return classGroups.update({ ...current, archivedAt: null });
  };
}

export function makeChangeClassGroupSchedule(deps: {
  classGroups: ClassGroupRepository;
  shifts: ShiftRepository;
}) {
  return async function changeSchedule(
    input: VersionedRef & { shiftId: string | null; periodIds: readonly string[] },
  ): Promise<ClassGroup> {
    const current = await loadForChange(deps.classGroups, input);
    let shift = null;
    if (input.shiftId !== null) {
      shift = await deps.shifts.findById(input.shiftId);
      if (!shift) {
        throw new ShiftNotFoundError();
      }
    }
    return deps.classGroups.update(scheduleClassGroup(current, shift, input.periodIds));
  };
}

export type RegisterClassGroup = ReturnType<typeof makeRegisterClassGroup>;
export type ChangeClassGroupSchedule = ReturnType<typeof makeChangeClassGroupSchedule>;
export type ListClassGroups = ReturnType<typeof makeListClassGroups>;
export type UpdateClassGroup = ReturnType<typeof makeUpdateClassGroup>;
export type ArchiveClassGroup = ReturnType<typeof makeArchiveClassGroup>;
export type RestoreClassGroup = ReturnType<typeof makeRestoreClassGroup>;
