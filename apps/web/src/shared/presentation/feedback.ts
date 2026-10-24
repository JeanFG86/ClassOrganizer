import { ApiRequestError } from '../application/api-error.ts';

export interface Feedback {
  kind: 'success' | 'error';
  text: string;
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : 'Ocorreu um erro inesperado.';
}

/**
 * O cadastro mudou ou sumiu desde que a tela foi carregada: a lista precisa ser
 * recarregada antes de o usuário tentar de novo.
 */
export function isOutdatedError(error: unknown): boolean {
  return (
    error instanceof ApiRequestError && (error.code === 'concurrency.stale' || error.status === 404)
  );
}
