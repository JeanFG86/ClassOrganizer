import type { RegisterShiftRequest, ShiftDto, UpdateShiftRequest } from '@classorganizer/contracts';

export interface ShiftsApi {
  /** Inclui os arquivados (`archivedAt` preenchido). */
  list(): Promise<ShiftDto[]>;
  register(input: RegisterShiftRequest): Promise<ShiftDto>;
  update(id: string, input: UpdateShiftRequest): Promise<ShiftDto>;
  archive(id: string, version: number): Promise<ShiftDto>;
  restore(id: string, version: number): Promise<ShiftDto>;
}
