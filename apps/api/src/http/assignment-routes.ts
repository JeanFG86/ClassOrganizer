import {
  createAssignmentRequestSchema,
  removeAssignmentQuerySchema,
  updateAssignmentRequestSchema,
} from '@classorganizer/contracts';
import type { AssignmentDto, AssignmentListDto } from '@classorganizer/contracts';
import type {
  AssignTeaching,
  ChangeAssignment,
  ListAssignments,
  RemoveAssignment,
  TeachingAssignment,
} from '@classorganizer/core';
import type { FastifyInstance } from 'fastify';
import { idParamsSchema, parseRequest } from './errors.ts';

export interface AssignmentRoutesDeps {
  assignTeaching: AssignTeaching['execute'];
  listAssignments: ListAssignments['execute'];
  changeAssignment: ChangeAssignment['execute'];
  removeAssignment: RemoveAssignment['execute'];
}

function toDto(assignment: TeachingAssignment): AssignmentDto {
  return {
    id: assignment.id,
    classGroupId: assignment.classGroupId,
    participants: assignment.participants.map((p) => ({ ...p })),
    weeklyLessons: assignment.weeklyLessons,
    resourceIds: [...assignment.resourceIds],
    createdAt: assignment.createdAt.toISOString(),
    version: assignment.version,
  };
}

export function registerAssignmentRoutes(app: FastifyInstance, deps: AssignmentRoutesDeps): void {
  app.get('/api/v1/assignments', async (): Promise<AssignmentListDto> => {
    const assignments = await deps.listAssignments();
    return { items: assignments.map(toDto) };
  });

  app.post('/api/v1/assignments', async (request, reply) => {
    const input = parseRequest(createAssignmentRequestSchema, request.body);
    const assignment = await deps.assignTeaching(input);
    return reply.status(201).send(toDto(assignment));
  });

  app.put('/api/v1/assignments/:id', async (request): Promise<AssignmentDto> => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(updateAssignmentRequestSchema, request.body);
    return toDto(await deps.changeAssignment({ id, ...input }));
  });

  app.delete('/api/v1/assignments/:id', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(removeAssignmentQuerySchema, request.query);
    await deps.removeAssignment({ id, version });
    return reply.status(204).send();
  });
}
