import {
  changeTeacherAvailabilityRequestSchema,
  registerTeacherRequestSchema,
  updateTeacherRequestSchema,
  versionRequestSchema,
} from '@classorganizer/contracts';
import type { TeacherDto, TeacherListDto } from '@classorganizer/contracts';
import type {
  ArchiveTeacher,
  ChangeTeacherAvailability,
  ListTeachers,
  RegisterTeacher,
  RestoreTeacher,
  Teacher,
  UpdateTeacher,
} from '@classorganizer/core';
import type { FastifyInstance } from 'fastify';
import { idParamsSchema, parseRequest } from './errors.ts';

export interface TeacherRoutesDeps {
  registerTeacher: RegisterTeacher;
  listTeachers: ListTeachers;
  updateTeacher: UpdateTeacher;
  archiveTeacher: ArchiveTeacher;
  restoreTeacher: RestoreTeacher;
  changeTeacherAvailability: ChangeTeacherAvailability;
}

function toDto(teacher: Teacher): TeacherDto {
  return {
    id: teacher.id,
    name: teacher.name,
    subjectIds: [...teacher.subjectIds],
    maxWeeklyLessons: teacher.maxWeeklyLessons,
    planningPeriods: teacher.planningPeriods,
    unavailable: teacher.unavailable.map((slot) => ({ ...slot })),
    createdAt: teacher.createdAt.toISOString(),
    archivedAt: teacher.archivedAt?.toISOString() ?? null,
    version: teacher.version,
  };
}

export function registerTeacherRoutes(app: FastifyInstance, deps: TeacherRoutesDeps): void {
  app.get('/api/v1/teachers', async (): Promise<TeacherListDto> => {
    const teachers = await deps.listTeachers();
    return { items: teachers.map(toDto) };
  });

  app.post('/api/v1/teachers', async (request, reply) => {
    const input = parseRequest(registerTeacherRequestSchema, request.body);
    const teacher = await deps.registerTeacher(input);
    return reply.status(201).send(toDto(teacher));
  });

  app.put('/api/v1/teachers/:id', async (request): Promise<TeacherDto> => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(updateTeacherRequestSchema, request.body);
    return toDto(await deps.updateTeacher({ id, ...input }));
  });

  app.put('/api/v1/teachers/:id/availability', async (request): Promise<TeacherDto> => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(changeTeacherAvailabilityRequestSchema, request.body);
    return toDto(await deps.changeTeacherAvailability({ id, ...input }));
  });

  app.post('/api/v1/teachers/:id/archive', async (request): Promise<TeacherDto> => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return toDto(await deps.archiveTeacher({ id, version }));
  });

  app.post('/api/v1/teachers/:id/restore', async (request): Promise<TeacherDto> => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return toDto(await deps.restoreTeacher({ id, version }));
  });
}
