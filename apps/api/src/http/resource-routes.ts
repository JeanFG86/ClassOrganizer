import {
  registerResourceRequestSchema,
  updateResourceRequestSchema,
  versionRequestSchema,
} from '@classorganizer/contracts';
import type { ResourceDto, ResourceListDto } from '@classorganizer/contracts';
import type {
  ArchiveResource,
  ListResources,
  RegisterResource,
  RestoreResource,
  Resource,
  UpdateResource,
} from '@classorganizer/core';
import type { FastifyInstance } from 'fastify';
import { idParamsSchema, parseRequest } from './errors.ts';

export interface ResourceRoutesDeps {
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

export function registerResourceRoutes(app: FastifyInstance, deps: ResourceRoutesDeps): void {
  app.get('/api/v1/resources', async (): Promise<ResourceListDto> => {
    const resources = await deps.listResources();
    return { items: resources.map(toDto) };
  });

  app.post('/api/v1/resources', async (request, reply) => {
    const input = parseRequest(registerResourceRequestSchema, request.body);
    const resource = await deps.registerResource(input);
    return reply.status(201).send(toDto(resource));
  });

  app.put('/api/v1/resources/:id', async (request): Promise<ResourceDto> => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(updateResourceRequestSchema, request.body);
    return toDto(await deps.updateResource({ id, ...input }));
  });

  app.post('/api/v1/resources/:id/archive', async (request): Promise<ResourceDto> => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return toDto(await deps.archiveResource({ id, version }));
  });

  app.post('/api/v1/resources/:id/restore', async (request): Promise<ResourceDto> => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return toDto(await deps.restoreResource({ id, version }));
  });
}
