import {
  registerSubjectRequestSchema,
  updateSubjectRequestSchema,
  versionRequestSchema,
} from '@classorganizer/contracts';
import type { SubjectDto, SubjectListDto } from '@classorganizer/contracts';
import type {
  ArchiveSubject,
  ListSubjects,
  RegisterSubject,
  RestoreSubject,
  Subject,
  UpdateSubject,
} from '@classorganizer/core';
import type { FastifyInstance } from 'fastify';
import { idParamsSchema, parseRequest } from './errors.ts';

export interface SubjectRoutesDeps {
  registerSubject: RegisterSubject;
  listSubjects: ListSubjects;
  updateSubject: UpdateSubject;
  archiveSubject: ArchiveSubject;
  restoreSubject: RestoreSubject;
}

function toDto(subject: Subject): SubjectDto {
  return {
    id: subject.id,
    name: subject.name,
    createdAt: subject.createdAt.toISOString(),
    archivedAt: subject.archivedAt?.toISOString() ?? null,
    version: subject.version,
  };
}

export function registerSubjectRoutes(app: FastifyInstance, deps: SubjectRoutesDeps): void {
  app.get('/api/v1/subjects', async (): Promise<SubjectListDto> => {
    const subjects = await deps.listSubjects();
    return { items: subjects.map(toDto) };
  });

  app.post('/api/v1/subjects', async (request, reply) => {
    const input = parseRequest(registerSubjectRequestSchema, request.body);
    const subject = await deps.registerSubject(input);
    return reply.status(201).send(toDto(subject));
  });

  app.put('/api/v1/subjects/:id', async (request): Promise<SubjectDto> => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(updateSubjectRequestSchema, request.body);
    return toDto(await deps.updateSubject({ id, ...input }));
  });

  app.post('/api/v1/subjects/:id/archive', async (request): Promise<SubjectDto> => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return toDto(await deps.archiveSubject({ id, version }));
  });

  app.post('/api/v1/subjects/:id/restore', async (request): Promise<SubjectDto> => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return toDto(await deps.restoreSubject({ id, version }));
  });
}
