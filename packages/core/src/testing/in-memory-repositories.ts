// Repositórios em memória para testes do core. Imitam o comportamento relevante dos
// adaptadores reais (versão otimista e unicidade); não são usados em produção.
import type { ClassGroupRepository } from '../modules/school-structure/application/ports/class-group-repository.ts';
import type { ResourceRepository } from '../modules/school-structure/application/ports/resource-repository.ts';
import type { ShiftRepository } from '../modules/school-structure/application/ports/shift-repository.ts';
import type { Resource } from '../modules/school-structure/domain/resource.ts';
import type { ClassGroup } from '../modules/school-structure/domain/class-group.ts';
import type { Shift } from '../modules/school-structure/domain/shift.ts';
import type { SubjectRepository } from '../modules/school-structure/application/ports/subject-repository.ts';
import type { Subject } from '../modules/school-structure/domain/subject.ts';
import type {
  AssignmentRepository,
  TeacherRepository,
} from '../modules/teaching/application/ports/index.ts';
import type { Teacher } from '../modules/teaching/domain/teacher.ts';
import { type TeachingAssignment } from '../modules/teaching/domain/assignment.ts';
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

export class InMemoryResourceRepository implements ResourceRepository {
  readonly store = new VersionedStore<Resource>();

  async findById(id: string) {
    return this.store.get(id);
  }

  async findByNormalizedName(normalizedName: string) {
    return this.store.values().find((r) => r.normalizedName === normalizedName) ?? null;
  }

  async add(resource: Resource) {
    this.store.items.set(resource.id, resource);
  }

  async update(resource: Resource) {
    return this.store.save(resource);
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
        .flatMap((a) => a.participants)
        .filter((p) => p.teacherId === teacherId)
        .map((p) => p.subjectId),
    );
  }
}

export class InMemorySubjectRepository implements SubjectRepository {
  readonly store = new VersionedStore<Subject>();

  async findById(id: string) {
    return this.store.get(id);
  }

  async findByNormalizedName(normalizedName: string) {
    return this.store.values().find((s) => s.normalizedName === normalizedName) ?? null;
  }

  async add(subject: Subject) {
    this.store.items.set(subject.id, subject);
  }

  async update(subject: Subject) {
    return this.store.save(subject);
  }

  async listAll() {
    return this.store.values();
  }
}

export class InMemoryTeacherRepository implements TeacherRepository {
  readonly store = new VersionedStore<Teacher>();

  async findById(id: string) {
    return this.store.get(id);
  }

  async add(teacher: Teacher) {
    this.store.items.set(teacher.id, teacher);
  }

  async update(teacher: Teacher) {
    return this.store.save(teacher);
  }

  async listAll() {
    return this.store.values();
  }
}
