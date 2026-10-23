import { shiftListSchema, shiftSchema } from '@classorganizer/contracts';
import type { RegisterShiftRequest, ShiftDto, UpdateShiftRequest } from '@classorganizer/contracts';
import type { InjectionKey } from 'vue';
import { apiRequest } from './api-client.ts';

export interface ShiftsApi {
  /** Inclui os arquivados (`archivedAt` preenchido). */
  list(): Promise<ShiftDto[]>;
  register(input: RegisterShiftRequest): Promise<ShiftDto>;
  update(id: string, input: UpdateShiftRequest): Promise<ShiftDto>;
  archive(id: string, version: number): Promise<ShiftDto>;
  restore(id: string, version: number): Promise<ShiftDto>;
}

export const shiftsApiKey: InjectionKey<ShiftsApi> = Symbol('ShiftsApi');

const shiftPath = (id: string) => `/shifts/${encodeURIComponent(id)}`;

export const httpShiftsApi: ShiftsApi = {
  async list() {
    const { items } = await apiRequest(shiftListSchema, '/shifts');
    return items;
  },
  register(input) {
    return apiRequest(shiftSchema, '/shifts', { method: 'POST', body: JSON.stringify(input) });
  },
  update(id, input) {
    return apiRequest(shiftSchema, shiftPath(id), { method: 'PUT', body: JSON.stringify(input) });
  },
  archive(id, version) {
    return apiRequest(shiftSchema, `${shiftPath(id)}/archive`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    });
  },
  restore(id, version) {
    return apiRequest(shiftSchema, `${shiftPath(id)}/restore`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    });
  },
};
