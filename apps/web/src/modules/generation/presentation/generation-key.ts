import type { InjectionKey } from 'vue';
import type { GenerationApi } from '../application/generation-api.ts';
export const generationApiKey: InjectionKey<GenerationApi> = Symbol('generationApi');
