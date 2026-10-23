// Repositórios em memória para testes do core. Imitam o comportamento relevante dos
// adaptadores reais (versão otimista e unicidade); não são usados em produção.
import type { ClassGroupRepository } from '../modules/school-structure/application/class-groups.ts';
import type { ShiftRepository } from '../modules/school-structure/application/shift-repository.ts';
import type { ClassGroup } from '../modules/school-structure/domain/class-group.ts';
import type { Shift } from '../modules/school-structure/domain/shift.ts';
import type { AssignmentRepository } from '../modules/teaching/application/ports.ts';
import {
  AssignmentAlreadyExistsError,
  type TeachingAssignment,
} from '../modules/teaching/domain/assignment.ts';
import { StaleVersionError } from '../shared/versioning.ts';

class VersionedStore<T extends { id: string; version: number }> {
  readonly items = new Map<string, T>();

  get(id: string): T | null {
    return this.items.get(id) ?? null;
  }

  values(): T[] {
    return [...this.items.values()];
  }

  save(entity: T): T {
    if (this.items.get(entity.id)?.version !== entity.version) {
      throw new StaleVersionError();
    }
    const saved = { ...entity, version: entity.version + 1 };
    this.items.set(entity.id, saved);
    return saved;
  }
}

export class InMemoryClassGroupRepository implements ClassGroupRepository {
  readonly store = new VersionedStore<ClassGroup>();

  async findById(id: string) {
    return this.store.get(id);
  }

  async findByNormalizedName(normalizedName: string) {
    return this.store.values().find((c) => c.normalizedName === normalizedName) ?? null;
  }

  async findByShift(shiftId: string) {
    return this.store.values().filter((c) => c.shiftId === shiftId);
  }

  async add(classGroup: ClassGroup) {
    this.store.items.set(classGroup.id, classGroup);
  }

  async update(classGroup: ClassGroup) {
    return this.store.save(classGroup);
  }

  async listAll() {
    return this.store.values();
  }
}

export class InMemoryShiftRepository implements ShiftRepository {
  readonly store = new VersionedStore<Shift>();

  async findById(id: string) {
    return this.store.get(id);
  }

  async findByNormalizedName(normalizedName: string) {
    return this.store.values().find((s) => s.normalizedName === normalizedName) ?? null;
  }

  async add(shift: Shift) {
    this.store.items.set(shift.id, shift);
  }

  async update(shift: Shift) {
    return this.store.save(shift);
  }

  async listAll() {
    return this.store.values();
  }
}

export class InMemoryAssignmentRepository implements AssignmentRepository {
  readonly store = new VersionedStore<TeachingAssignment>();

  async findById(id: string) {
    return this.store.get(id);
  }

  async add(assignment: TeachingAssignment) {
    const duplicate = this.store
      .values()
      .some(
        (a) => a.classGroupId === assignment.classGroupId && a.subjectId === assignment.subjectId,
      );
    if (duplicate) {
      throw new AssignmentAlreadyExistsError();
    }
    this.store.items.set(assignment.id, assignment);
  }

  async update(assignment: TeachingAssignment) {
    return this.store.save(assignment);
  }

  async remove(assignment: TeachingAssignment) {
    if (this.store.items.get(assignment.id)?.version !== assignment.version) {
      throw new StaleVersionError();
    }
    this.store.items.delete(assignment.id);
  }

  async listAll() {
    return this.store.values();
  }

  async subjectIdsAssignedTo(teacherId: string) {
    return new Set(
      this.store
        .values()
        .filter((a) => a.teacherId === teacherId)
        .map((a) => a.subjectId),
    );
  }
}
