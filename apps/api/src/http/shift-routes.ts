import {
  minutesFromTime,
  registerShiftRequestSchema,
  updateShiftRequestSchema,
  versionRequestSchema,
} from '@classorganizer/contracts';

import type { PeriodInput } from '@classorganizer/core';
import type { FastifyInstance } from 'fastify';
import { idParamsSchema, parseRequest } from './errors.ts';
import { ShiftController, type ShiftOperations } from '../controllers/shift-controller.ts';
export type ShiftRoutesDeps = ShiftOperations;
function toPeriodInput(period: {
  id?: string | undefined;
  start: string;
  end: string;
}): PeriodInput {
  return {
    id: period.id,
    startMinute: minutesFromTime(period.start),
    endMinute: minutesFromTime(period.end),
  };
}
export function registerShiftRoutes(app: FastifyInstance, deps: ShiftRoutesDeps): void {
  const controller = new ShiftController(deps);
  app.get('/api/v1/shifts', () => controller.listShifts());

  app.post('/api/v1/shifts', async (request, reply) => {
    const input = parseRequest(registerShiftRequestSchema, request.body);
    const shift = await controller.registerShift({
      name: input.name,
      periods: input.periods.map(toPeriodInput),
    });
    return reply.status(201).send(shift);
  });

  app.put('/api/v1/shifts/:id', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(updateShiftRequestSchema, request.body);
    return await controller.updateShift({
      id,
      version: input.version,
      name: input.name,
      periods: input.periods.map(toPeriodInput),
    });
  });

  app.post('/api/v1/shifts/:id/archive', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return await controller.archiveShift({ id, version });
  });

  app.post('/api/v1/shifts/:id/restore', async (request) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return await controller.restoreShift({ id, version });
  });
}
