import { registerSubjectRequestSchema } from '@classorganizer/contracts';
import type { SubjectDto, SubjectListDto } from '@classorganizer/contracts';
import type { ListSubjects, RegisterSubject, Subject } from '@classorganizer/core';
import type { FastifyInstance } from 'fastify';
import { parseRequest } from './errors.ts';

export interface SubjectRoutesDeps {
  registerSubject: RegisterSubject;
  listSubjects: ListSubjects;
}

function toDto(subject: Subject): SubjectDto {
  return { id: subject.id, name: subject.name, createdAt: subject.createdAt.toISOString() };
}

export function registerSubjectRoutes(
  app: FastifyInstance,
  { registerSubject, listSubjects }: SubjectRoutesDeps,
): void {
  app.get('/api/v1/subjects', async (): Promise<SubjectListDto> => {
    const subjects = await listSubjects();
    return { items: subjects.map(toDto) };
  });

  app.post('/api/v1/subjects', async (request, reply) => {
    const input = parseRequest(registerSubjectRequestSchema, request.body);
    const subject = await registerSubject(input);
    return reply.status(201).send(toDto(subject));
  });
}
