import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiRequestError } from '../../application/api-error.ts';
import { FetchHttpClient } from './fetch-http-client.ts';
import { createSubjectsApi } from '../../../modules/school-structure/infra/subjects-http-api.ts';
import { httpCatalogApi } from './catalog-http-api.ts';

describe('FetchHttpClient', () => {
  it('baixa binário somente com o tipo esperado e mantém erros JSON fora do arquivo', async () => {
    const transport = vi.fn<typeof fetch>(
      async () => new Response('arquivo', { headers: { 'content-type': 'application/x-test' } }),
    );
    const client = new FetchHttpClient({ fetch: transport, baseUrl: '/api' });
    const blob = await client.download('/file', 'application/x-test');
    expect(await blob.text()).toBe('arquivo');
    expect(transport).toHaveBeenCalledWith('/api/file', {
      headers: { accept: 'application/x-test', 'x-entreaulas-client': 'web' },
    });
    transport.mockResolvedValueOnce(Response.json({ invalid: true }));
    await expect(client.download('/file', 'application/x-test')).rejects.toMatchObject({
      code: 'contract',
    });
    transport.mockResolvedValueOnce(
      Response.json(
        { error: { code: 'concurrency.stale', message: 'Atualize a prévia.' } },
        { status: 409 },
      ),
    );
    await expect(client.download('/file', 'application/x-test')).rejects.toMatchObject({
      code: 'concurrency.stale',
      status: 409,
    });
  });
  it('notifica sessão expirada e traduz perda de conexão durante o download', async () => {
    const expired = vi.fn();
    const transport = vi.fn<typeof fetch>(async () => new Response(null, { status: 401 }));
    const client = new FetchHttpClient({ fetch: transport, onSessionExpired: expired });
    await expect(client.download('/file', 'application/x-test')).rejects.toMatchObject({
      status: 401,
    });
    expect(expired).toHaveBeenCalledOnce();
    transport.mockRejectedValueOnce(new TypeError('offline'));
    await expect(client.download('/file', 'application/x-test')).rejects.toMatchObject({
      code: 'network',
    });
  });
  it('preserva os métodos quando um cliente estende o cadastro por composição', async () => {
    const schema = z.object({
      id: z.string(),
      name: z.string(),
      archivedAt: z.string().nullable(),
      version: z.number(),
    });
    const client = new FetchHttpClient({ fetch: async () => Response.json({ items: [] }) });
    const composed = {
      ...httpCatalogApi('/example', schema, z.object({ items: z.array(schema) }), client),
    };
    await expect(composed.list()).resolves.toEqual([]);
  });
  it('valida o contrato e permite injetar transporte no serviço de disciplinas', async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({
        items: [
          {
            id: 'd245203f-f8e2-4a0c-9cee-a562c95ea510',
            name: 'Oficina fictícia',
            createdAt: '2026-02-01T12:00:00.000Z',
            archivedAt: null,
            version: 1,
          },
        ],
      }),
    );
    const api = createSubjectsApi(new FetchHttpClient({ fetch: transport, baseUrl: '/example' }));
    expect(await api.list()).toMatchObject([{ name: 'Oficina fictícia' }]);
    expect(transport).toHaveBeenCalledWith(
      '/example/subjects',
      expect.objectContaining({
        headers: expect.not.objectContaining({ 'content-type': 'application/json' }),
      }),
    );
  });

  it('aceita respostas sem corpo nas operações 204', async () => {
    const client = new FetchHttpClient({ fetch: async () => new Response(null, { status: 204 }) });
    await expect(
      client.request(z.undefined(), '/auth/logout', { method: 'POST' }),
    ).resolves.toBeUndefined();
  });

  it('recusa uma resposta bem-sucedida fora do contrato', async () => {
    const client = new FetchHttpClient({ fetch: async () => Response.json({ invalid: true }) });
    await expect(client.request(z.object({ id: z.string() }), '/subjects')).rejects.toMatchObject({
      code: 'contract',
    });
  });

  it('notifica expiração somente nas chamadas protegidas', async () => {
    const expired = vi.fn();
    const client = new FetchHttpClient({
      onSessionExpired: expired,
      fetch: async () =>
        Response.json(
          { error: { code: 'access.session_required', message: 'Entre novamente.' } },
          { status: 401 },
        ),
    });
    await expect(client.request(z.unknown(), '/subjects')).rejects.toBeInstanceOf(ApiRequestError);
    await expect(client.request(z.unknown(), '/auth/login')).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('traduz falhas de transporte para a mensagem de conexão', async () => {
    const client = new FetchHttpClient({
      fetch: async () => {
        throw new TypeError('offline');
      },
    });
    await expect(client.request(z.unknown(), '/subjects')).rejects.toMatchObject({
      code: 'network',
    });
  });
});
