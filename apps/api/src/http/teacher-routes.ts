import { registerTeacherRequestSchema } from '@classorganizer/contracts';
import type { TeacherDto, TeacherListDto } from '@classorganizer/contracts';
import type { ListTeachers, RegisterTeacher, Teacher } from '@classorganizer/core';
import type { FastifyInstance } from 'fastify';
import { parseRequest } from './errors.ts';

export interface TeacherRoutesDeps {
  registerTeacher: RegisterTeacher;
  listTeachers: ListTeachers;
}

function toDto(teacher: Teacher): TeacherDto {
  return {
    id: teacher.id,
    name: teacher.name,
    subjectIds: [...teacher.subjectIds],
    createdAt: teacher.createdAt.toISOString(),
  };
}

export function registerTeacherRoutes(
  app: FastifyInstance,
  { registerTeacher, listTeachers }: TeacherRoutesDeps,
): void {
  app.get('/api/v1/teachers', async (): Promise<TeacherListDto> => {
    const teachers = await listTeachers();
    return { items: teachers.map(toDto) };
  });

  app.post('/api/v1/teachers', async (request, reply) => {
    const input = parseRequest(registerTeacherRequestSchema, request.body);
    const teacher = await registerTeacher(input);
    return reply.status(201).send(toDto(teacher));
  });
}
