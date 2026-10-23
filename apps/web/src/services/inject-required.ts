import { inject } from 'vue';
import type { InjectionKey } from 'vue';

/** Obtém uma dependência fornecida pela composição (`main.ts` ou o teste). */
export function injectRequired<T>(key: InjectionKey<T>): T {
  const value = inject(key);
  if (value === undefined) {
    throw new Error(`Dependência não fornecida: ${String(key.description ?? key)}`);
  }
  return value;
}
