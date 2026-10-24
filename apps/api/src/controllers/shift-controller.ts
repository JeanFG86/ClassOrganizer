import { timeFromMinutes } from '@classorganizer/contracts';
import type { ShiftDto } from '@classorganizer/contracts';
import type {
  ArchiveShift,
  ListShifts,
  RegisterShift,
  RestoreShift,
  Shift,
  UpdateShift,
} from '@classorganizer/core';

export interface ShiftOperations {
  registerShift: RegisterShift['execute'];
  listShifts: ListShifts['execute'];
  updateShift: UpdateShift['execute'];
  archiveShift: ArchiveShift['execute'];
  restoreShift: RestoreShift['execute'];
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
export class ShiftController {
  readonly #operations: ShiftOperations;
  constructor(operations: ShiftOperations) {
    this.#operations = operations;
  }
  async registerShift(...args: Parameters<ShiftOperations['registerShift']>) {
    return toDto(await this.#operations.registerShift(...args));
  }
  async listShifts(...args: Parameters<ShiftOperations['listShifts']>) {
    return { items: (await this.#operations.listShifts(...args)).map(toDto) };
  }
  async updateShift(...args: Parameters<ShiftOperations['updateShift']>) {
    return toDto(await this.#operations.updateShift(...args));
  }
  async archiveShift(...args: Parameters<ShiftOperations['archiveShift']>) {
    return toDto(await this.#operations.archiveShift(...args));
  }
  async restoreShift(...args: Parameters<ShiftOperations['restoreShift']>) {
    return toDto(await this.#operations.restoreShift(...args));
  }
}
