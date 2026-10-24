import type { ResourceDto } from '@classorganizer/contracts';
import type {
  ArchiveResource,
  ListResources,
  RegisterResource,
  RestoreResource,
  Resource,
  UpdateResource,
} from '@classorganizer/core';

export interface ResourceOperations {
  registerResource: RegisterResource['execute'];
  listResources: ListResources['execute'];
  updateResource: UpdateResource['execute'];
  archiveResource: ArchiveResource['execute'];
  restoreResource: RestoreResource['execute'];
}
function toDto(resource: Resource): ResourceDto {
  return {
    id: resource.id,
    name: resource.name,
    createdAt: resource.createdAt.toISOString(),
    archivedAt: resource.archivedAt?.toISOString() ?? null,
    version: resource.version,
  };
}
export class ResourceController {
  readonly #operations: ResourceOperations;
  constructor(operations: ResourceOperations) {
    this.#operations = operations;
  }
  async registerResource(...args: Parameters<ResourceOperations['registerResource']>) {
    return toDto(await this.#operations.registerResource(...args));
  }
  async listResources(...args: Parameters<ResourceOperations['listResources']>) {
    return { items: (await this.#operations.listResources(...args)).map(toDto) };
  }
  async updateResource(...args: Parameters<ResourceOperations['updateResource']>) {
    return toDto(await this.#operations.updateResource(...args));
  }
  async archiveResource(...args: Parameters<ResourceOperations['archiveResource']>) {
    return toDto(await this.#operations.archiveResource(...args));
  }
  async restoreResource(...args: Parameters<ResourceOperations['restoreResource']>) {
    return toDto(await this.#operations.restoreResource(...args));
  }
}
