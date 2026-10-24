import { compareNames } from '../../../shared/names.ts';
import type { Clock, IdGenerator } from '../../../shared/ports.ts';
import { assertVersion } from '../../../shared/versioning.ts';
import type { VersionedRef } from '../../../shared/versioning.ts';
import {
  ResourceNameAlreadyInUseError,
  ResourceNotFoundError,
  createResource,
  renameResource,
} from '../domain/resource.ts';
import type { Resource } from '../domain/resource.ts';

export interface ResourceRepository {
  findById(id: string): Promise<Resource | null>;
  findByNormalizedName(normalizedName: string): Promise<Resource | null>;
  /** Deve lançar `ResourceNameAlreadyInUseError` em caso de nome duplicado concorrente. */
  add(resource: Resource): Promise<void>;
  /** Grava condicionado à versão; lança `StaleVersionError` se outra alteração chegou antes. */
  update(resource: Resource): Promise<Resource>;
  listAll(): Promise<Resource[]>;
}

async function loadForChange(resources: ResourceRepository, ref: VersionedRef) {
  const resource = await resources.findById(ref.id);
  if (!resource) {
    throw new ResourceNotFoundError();
  }
  assertVersion(resource.version, ref.version);
  return resource;
}

export function makeRegisterResource(deps: {
  resources: ResourceRepository;
  clock: Clock;
  ids: IdGenerator;
}) {
  return async function registerResource(input: { name: string }): Promise<Resource> {
    const resource = createResource({
      id: deps.ids.next(),
      name: input.name,
      createdAt: deps.clock.now(),
    });
    const existing = await deps.resources.findByNormalizedName(resource.normalizedName);
    if (existing) {
      throw new ResourceNameAlreadyInUseError(existing);
    }
    await deps.resources.add(resource);
    return resource;
  };
}

export function makeListResources({ resources }: { resources: ResourceRepository }) {
  return async function listResources(): Promise<Resource[]> {
    const all = await resources.listAll();
    return all.toSorted((a, b) => compareNames(a.name, b.name));
  };
}

export function makeUpdateResource({ resources }: { resources: ResourceRepository }) {
  return async function updateResource(input: VersionedRef & { name: string }) {
    const renamed = renameResource(await loadForChange(resources, input), input.name);
    const sameName = await resources.findByNormalizedName(renamed.normalizedName);
    if (sameName && sameName.id !== renamed.id) {
      throw new ResourceNameAlreadyInUseError(sameName);
    }
    return resources.update(renamed);
  };
}

/** Arquivar não altera os blocos: eles voltam a reservar o recurso se ele for restaurado. */
export function makeArchiveResource(deps: { resources: ResourceRepository; clock: Clock }) {
  return async function archive(ref: VersionedRef): Promise<Resource> {
    const current = await loadForChange(deps.resources, ref);
    if (current.archivedAt) {
      return current;
    }
    return deps.resources.update({ ...current, archivedAt: deps.clock.now() });
  };
}

export function makeRestoreResource({ resources }: { resources: ResourceRepository }) {
  return async function restore(ref: VersionedRef): Promise<Resource> {
    const current = await loadForChange(resources, ref);
    if (!current.archivedAt) {
      return current;
    }
    return resources.update({ ...current, archivedAt: null });
  };
}

export type RegisterResource = ReturnType<typeof makeRegisterResource>;
export type ListResources = ReturnType<typeof makeListResources>;
export type UpdateResource = ReturnType<typeof makeUpdateResource>;
export type ArchiveResource = ReturnType<typeof makeArchiveResource>;
export type RestoreResource = ReturnType<typeof makeRestoreResource>;
