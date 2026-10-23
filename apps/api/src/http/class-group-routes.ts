import {
  registerClassGroupRequestSchema,
  updateClassGroupRequestSchema,
  versionRequestSchema,
} from '@classorganizer/contracts';
import type { ClassGroupDto, ClassGroupListDto } from '@classorganizer/contracts';
import type {
  ArchiveClassGroup,
  ClassGroup,
  ListClassGroups,
  RegisterClassGroup,
  RestoreClassGroup,
  UpdateClassGroup,
} from '@classorganizer/core';
import type { FastifyInstance } from 'fastify';
import { idParamsSchema, parseRequest } from './errors.ts';

export interface ClassGroupRoutesDeps {
  registerClassGroup: RegisterClassGroup;
  listClassGroups: ListClassGroups;
  updateClassGroup: UpdateClassGroup;
  archiveClassGroup: ArchiveClassGroup;
  restoreClassGroup: RestoreClassGroup;
}

function toDto(classGroup: ClassGroup): ClassGroupDto {
  return {
    id: classGroup.id,
    name: classGroup.name,
    createdAt: classGroup.createdAt.toISOString(),
    archivedAt: classGroup.archivedAt?.toISOString() ?? null,
    version: classGroup.version,
  };
}

export function registerClassGroupRoutes(app: FastifyInstance, deps: ClassGroupRoutesDeps): void {
  app.get('/api/v1/class-groups', async (): Promise<ClassGroupListDto> => {
    const classGroups = await deps.listClassGroups();
    return { items: classGroups.map(toDto) };
  });

  app.post('/api/v1/class-groups', async (request, reply) => {
    const input = parseRequest(registerClassGroupRequestSchema, request.body);
    const classGroup = await deps.registerClassGroup(input);
    return reply.status(201).send(toDto(classGroup));
  });

  app.put('/api/v1/class-groups/:id', async (request): Promise<ClassGroupDto> => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(updateClassGroupRequestSchema, request.body);
    return toDto(await deps.updateClassGroup({ id, ...input }));
  });

  app.post('/api/v1/class-groups/:id/archive', async (request): Promise<ClassGroupDto> => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return toDto(await deps.archiveClassGroup({ id, version }));
  });

  app.post('/api/v1/class-groups/:id/restore', async (request): Promise<ClassGroupDto> => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return toDto(await deps.restoreClassGroup({ id, version }));
  });
}
