import type { z } from 'zod';
export interface HttpClient {
  request<T extends z.ZodType>(schema: T, path: string, init?: RequestInit): Promise<z.infer<T>>;
}
