import {
  minutesFromTime,
  registerShiftRequestSchema,
  timeFromMinutes,
  updateShiftRequestSchema,
  versionRequestSchema,
} from '@classorganizer/contracts';
import type { ShiftDto, ShiftListDto } from '@classorganizer/contracts';
import type {
  ArchiveShift,
  ListShifts,
  PeriodInput,
  RegisterShift,
  RestoreShift,
  Shift,
  UpdateShift,
} from '@classorganizer/core';
import type { FastifyInstance } from 'fastify';
import { idParamsSchema, parseRequest } from './errors.ts';

export interface ShiftRoutesDeps {
  registerShift: RegisterShift;
  listShifts: ListShifts;
  updateShift: UpdateShift;
  archiveShift: ArchiveShift;
  restoreShift: RestoreShift;
}

function toDto(shift: Shift): ShiftDto {
  return {
    id: shift.id,
    name: shift.name,
    periods: shift.periods.map((p) => ({
      id: p.id,
      start: timeFromMinutes(p.startMinute),
      end: timeFromMinutes(p.endMinute),
    })),
    createdAt: shift.createdAt.toISOString(),
    archivedAt: shift.archivedAt?.toISOString() ?? null,
    version: shift.version,
  };
}

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
  app.get('/api/v1/shifts', async (): Promise<ShiftListDto> => {
    const shifts = await deps.listShifts();
    return { items: shifts.map(toDto) };
  });

  app.post('/api/v1/shifts', async (request, reply) => {
    const input = parseRequest(registerShiftRequestSchema, request.body);
    const shift = await deps.registerShift({
      name: input.name,
      periods: input.periods.map(toPeriodInput),
    });
    return reply.status(201).send(toDto(shift));
  });

  app.put('/api/v1/shifts/:id', async (request): Promise<ShiftDto> => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(updateShiftRequestSchema, request.body);
    return toDto(
      await deps.updateShift({
        id,
        version: input.version,
        name: input.name,
        periods: input.periods.map(toPeriodInput),
      }),
    );
  });

  app.post('/api/v1/shifts/:id/archive', async (request): Promise<ShiftDto> => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return toDto(await deps.archiveShift({ id, version }));
  });

  app.post('/api/v1/shifts/:id/restore', async (request): Promise<ShiftDto> => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { version } = parseRequest(versionRequestSchema, request.body);
    return toDto(await deps.restoreShift({ id, version }));
  });
}
