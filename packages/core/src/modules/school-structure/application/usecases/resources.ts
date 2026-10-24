import type { ResourceRepository } from '../ports/resource-repository.ts';
export type { ResourceRepository } from '../ports/resource-repository.ts';
import { ResourceEntity } from '../../domain/resource.ts';
import { bindUseCase } from '../../../../shared/use-case.ts';
import { compareNames } from '../../../../shared/names.ts';
import type { Clock, IdGenerator } from '../../../../shared/ports.ts';
import { assertVersion } from '../../../../shared/versioning.ts';
import type { VersionedRef } from '../../../../shared/versioning.ts';
import { ResourceNameAlreadyInUseError, ResourceNotFoundError } from '../../domain/resource.ts';
import type { Resource } from '../../domain/resource.ts';

async function loadForChange(resources: ResourceRepository, ref: VersionedRef) {
  const resource = await resources.findById(ref.id);
  if (!resource) {
    throw new ResourceNotFoundError();
  }
  assertVersion(resource.version, ref.version);
  return resource;
}

export type RegisterResourceDependencies = {
  resources: ResourceRepository;
  clock: Clock;
  ids: IdGenerator;
};
export class RegisterResource {
  readonly #deps: RegisterResourceDependencies;
  constructor(deps: RegisterResourceDependencies) {
    this.#deps = deps;
  }
  async execute(input: { name: string }): Promise<Resource> {
    const deps = this.#deps;

    const resource = ResourceEntity.create({
      id: deps.ids.next(),
      name: input.name,
      createdAt: deps.clock.now(),
    }).snapshot();

    const existing = await deps.resources.findByNormalizedName(resource.normalizedName);

    if (existing) {
      throw new ResourceNameAlreadyInUseError(existing);
    }

    await deps.resources.add(resource);

    return resource;
  }
}
export function makeRegisterResource(deps: RegisterResourceDependencies) {
  return bindUseCase(new RegisterResource(deps));
}

export type ListResourcesDependencies = { resources: ResourceRepository };
export class ListResources {
  readonly #deps: ListResourcesDependencies;
  constructor(deps: ListResourcesDependencies) {
    this.#deps = deps;
  }
  async execute(): Promise<Resource[]> {
    const { resources } = this.#deps;

    const all = await resources.listAll();

    return all.toSorted((a, b) => compareNames(a.name, b.name));
  }
}
export function makeListResources(deps: ListResourcesDependencies) {
  return bindUseCase(new ListResources(deps));
}

export type UpdateResourceDependencies = { resources: ResourceRepository };
export class UpdateResource {
  readonly #deps: UpdateResourceDependencies;
  constructor(deps: UpdateResourceDependencies) {
    this.#deps = deps;
  }
  async execute(input: VersionedRef & { name: string }) {
    const { resources } = this.#deps;

    const renamed = ResourceEntity.reconstitute(await loadForChange(resources, input))
      .rename(input.name)
      .snapshot();

    const sameName = await resources.findByNormalizedName(renamed.normalizedName);

    if (sameName && sameName.id !== renamed.id) {
      throw new ResourceNameAlreadyInUseError(sameName);
    }

    return resources.update(renamed);
  }
}
export function makeUpdateResource(deps: UpdateResourceDependencies) {
  return bindUseCase(new UpdateResource(deps));
}

/** Arquivar não altera os blocos: eles voltam a reservar o recurso se ele for restaurado. */
export type ArchiveResourceDependencies = { resources: ResourceRepository; clock: Clock };
export class ArchiveResource {
  readonly #deps: ArchiveResourceDependencies;
  constructor(deps: ArchiveResourceDependencies) {
    this.#deps = deps;
  }
  async execute(ref: VersionedRef): Promise<Resource> {
    const deps = this.#deps;

    const current = await loadForChange(deps.resources, ref);

    if (current.archivedAt) {
      return current;
    }

    return deps.resources.update(
      ResourceEntity.reconstitute(current).archive(deps.clock.now()).snapshot(),
    );
  }
}
export function makeArchiveResource(deps: ArchiveResourceDependencies) {
  return bindUseCase(new ArchiveResource(deps));
}

export type RestoreResourceDependencies = { resources: ResourceRepository };
export class RestoreResource {
  readonly #deps: RestoreResourceDependencies;
  constructor(deps: RestoreResourceDependencies) {
    this.#deps = deps;
  }
  async execute(ref: VersionedRef): Promise<Resource> {
    const { resources } = this.#deps;

    const current = await loadForChange(resources, ref);

    if (!current.archivedAt) {
      return current;
    }

    return resources.update(ResourceEntity.reconstitute(current).restore().snapshot());
  }
}
export function makeRestoreResource(deps: RestoreResourceDependencies) {
  return bindUseCase(new RestoreResource(deps));
}
