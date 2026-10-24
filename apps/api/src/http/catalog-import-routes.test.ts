import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { CatalogImportStaleError, catalogImportTemplate } from '@classorganizer/core';
import { buildTestApp } from '../testing/stub-deps.ts';
import { registerCatalogImportRoutes } from './catalog-import-routes.ts';
import type { CatalogImportOperations } from '../controllers/catalog-import-controller.ts';

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

function setup() {
  const operations: CatalogImportOperations = {
    catalogImportTemplate: vi.fn(async ({ kind }) => catalogImportTemplate(kind)),
    previewCatalogImport: vi.fn(async ({ kind }) => ({
      kind,
      digest: 'resumo',
      columns: ['Disciplina'],
      fileErrors: [],
      summary: { total: 1, create: 1, existing: 0, invalid: 0 },
      rows: [{ line: 2, cells: ['Educação Física'], status: 'create' as const, messages: [] }],
    })),
    importCatalog: vi.fn(async ({ kind }) => ({ kind, created: 1, existing: 0 })),
  };
  app = buildTestApp({});
  registerCatalogImportRoutes(app, operations);
  return operations;
}

describe('HTTP da importação de cadastros', () => {
  it('entrega o modelo CSV em UTF-8 como anexo, sem cache', async () => {
    setup();
    const response = await app.inject({ url: '/api/v1/catalog-imports/teachers/template' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="modelo-professores.csv"',
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.startsWith('\uFEFFProfessor;Disciplinas')).toBe(true);
    expect((await app.inject({ url: '/api/v1/catalog-imports/rooms/template' })).statusCode).toBe(
      400,
    );
  });

  it('a prévia encaminha tipo e conteúdo com acentos e devolve as linhas', async () => {
    const operations = setup();
    const content = 'Disciplina\nEducação Física';
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/catalog-imports/preview',
      payload: { kind: 'subjects', content },
    });

    expect(response.statusCode).toBe(200);
    expect(operations.previewCatalogImport).toHaveBeenCalledWith({ kind: 'subjects', content });
    expect(response.json()).toMatchObject({
      digest: 'resumo',
      rows: [{ line: 2, cells: ['Educação Física'], status: 'create' }],
    });
  });

  it('a confirmação exige o resumo da prévia e responde 201', async () => {
    const operations = setup();
    const payload = { kind: 'assignments', content: 'Turma', digest: 'resumo' };

    const response = await app.inject({ method: 'POST', url: '/api/v1/catalog-imports', payload });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ kind: 'assignments', created: 1, existing: 0 });
    for (const invalid of [
      { kind: 'subjects', content: 'x' },
      { kind: 'rooms', content: 'x', digest: 'resumo' },
      { kind: 'subjects', content: 'x', digest: '' },
    ]) {
      expect(
        (await app.inject({ method: 'POST', url: '/api/v1/catalog-imports', payload: invalid }))
          .statusCode,
      ).toBe(400);
    }
    expect(operations.importCatalog).toHaveBeenCalledOnce();
  });

  it('traduz resultado alterado depois da prévia para 409', async () => {
    const operations = setup();
    vi.mocked(operations.importCatalog).mockRejectedValueOnce(new CatalogImportStaleError());

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/catalog-imports',
      payload: { kind: 'subjects', content: 'Disciplina\nArte', digest: 'resumo' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('concurrency.stale');
  });

  it('aceita arquivos maiores que o limite padrão do corpo JSON', async () => {
    const operations = setup();
    // Acentos ocupam 2 bytes: o corpo passa de 1 MiB sem exceder o limite de caracteres.
    const content = 'Disciplina\n' + 'Educação Física inventada\n'.repeat(38_000);
    expect(content.length).toBeLessThan(1_000_000);
    expect(Buffer.byteLength(content)).toBeGreaterThan(1024 * 1024);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/catalog-imports/preview',
      payload: { kind: 'subjects', content },
    });

    expect(response.statusCode).toBe(200);
    expect(operations.previewCatalogImport).toHaveBeenCalledOnce();
  });
});
