import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../testing/stub-deps.ts';
import { registerPlanningRoutes } from './planning-routes.ts';
import type { PlanningOperations } from '../controllers/planning-controller.ts';

const id = '11111111-1111-4111-8111-111111111111';
const revisionId = '22222222-2222-4222-8222-222222222222';
let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});
function setup() {
  const operations: PlanningOperations = {
    timetableWorkbook: vi.fn(async () => ({
      content: new Uint8Array([80, 75, 3, 4]),
      fileName: 'grade.xlsx',
    })),
    timetableReport: vi.fn(async () => ({
      planning: { id, name: 'Plano inventado', year: 2027, version: 1, archived: false },
      revision: {
        id: revisionId,
        number: 1,
        name: null,
        sealedAt: null,
        capturedAt: '2026-01-01T00:00:00Z',
        catalogVersion: 1,
        historical: false,
      },
      generatedAt: new Date('2026-01-01T00:00:00Z'),
      perspective: 'teacher' as const,
      notices: [],
      targets: [],
      sheets: [],
      revisions: [],
    })),
    preserveRevision: vi.fn(async () => ({ id, version: 2, revisionId })),
    listPlannings: vi.fn(),
    detailPlanning: vi.fn(),
    createPlanning: vi.fn(),
    changePlanning: vi.fn(),
    compareRevisions: vi.fn(async () => ({
      version: 1,
      from: { id: revisionId, number: 1, name: null },
      to: { id: revisionId, number: 1, name: null },
      kept: 0,
      added: [],
      removed: [],
      catalogChanges: [],
      rulesChanged: false,
    })),
    revisionChecklist: vi.fn(async () => ({
      version: 1,
      revisionId,
      reference: null,
      complete: false,
      items: [],
    })),
    renameRevision: vi.fn(async () => ({ id, version: 2 })),
    restoreRevision: vi.fn(async () => ({ id, version: 2, revisionId })),
  };
  app = buildTestApp({});
  registerPlanningRoutes(app, operations);
  return operations;
}
describe('HTTP das versões de planejamento', () => {
  it('retorna XLSX binário sem cache e exige revisão e versão explícitas', async () => {
    const operations = setup();
    const response = await app.inject({
      url: `/api/v1/plannings/${id}/workbook?revisionId=${revisionId}&version=3`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers['content-disposition']).toBe('attachment; filename="grade.xlsx"');
    expect(response.headers['cache-control']).toBe('no-store');
    expect([...response.rawPayload]).toEqual([80, 75, 3, 4]);
    expect(operations.timetableWorkbook).toHaveBeenCalledWith({ id, revisionId, version: 3 });
    for (const query of [
      `revisionId=${revisionId}`,
      'version=3',
      `revisionId=${revisionId}&version=0`,
      `revisionId=invalid&version=1`,
    ])
      expect(
        (await app.inject({ url: `/api/v1/plannings/${id}/workbook?${query}` })).statusCode,
      ).toBe(400);
    expect(operations.timetableWorkbook).toHaveBeenCalledOnce();
  });
  it('exige revisão e perspectiva explícitas no relatório e encaminha o filtro', async () => {
    const operations = setup();
    const response = await app.inject({
      url: `/api/v1/plannings/${id}/report?revisionId=${revisionId}&perspective=teacher&entityId=${id}`,
    });
    expect(response.statusCode).toBe(200);
    expect(operations.timetableReport).toHaveBeenCalledWith({
      id,
      revisionId,
      perspective: 'teacher',
      entityId: id,
    });
    for (const query of [
      'perspective=class',
      `revisionId=${revisionId}&perspective=resource`,
      `revisionId=${revisionId}&perspective=class&entityId=invalid`,
    ])
      expect(
        (await app.inject({ url: `/api/v1/plannings/${id}/report?${query}` })).statusCode,
      ).toBe(400);
    expect(operations.timetableReport).toHaveBeenCalledTimes(1);
  });
  it('encaminha identificadores, versão e nome com acentos', async () => {
    const operations = setup();
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/plannings/${id}/revisions/${revisionId}/name`,
      payload: { name: '  Versão aprovada  ', version: 1 },
    });
    expect(response.statusCode).toBe(200);
    expect(operations.renameRevision).toHaveBeenCalledWith({
      id,
      revisionId,
      name: 'Versão aprovada',
      version: 1,
    });
    const restored = await app.inject({
      method: 'POST',
      url: `/api/v1/plannings/${id}/revisions/${revisionId}/restore`,
      payload: { version: 1 },
    });
    expect(restored.statusCode).toBe(201);
    expect(restored.json()).toEqual({ id, version: 2, revisionId });
    expect(operations.restoreRevision).toHaveBeenCalledWith({ id, revisionId, version: 1 });
    const preserved = await app.inject({
      method: 'POST',
      url: `/api/v1/plannings/${id}/revisions/${revisionId}/preserve`,
      payload: { version: 1 },
    });
    expect(preserved.statusCode).toBe(201);
    expect(preserved.json()).toEqual({ id, version: 2, revisionId });
    expect(operations.preserveRevision).toHaveBeenCalledWith({ id, revisionId, version: 1 });
  });
  it('valida consultas e permite comparar uma revisão com ela mesma', async () => {
    const operations = setup();
    const response = await app.inject({
      url: `/api/v1/plannings/${id}/revisions/comparison?fromRevisionId=${revisionId}&toRevisionId=${revisionId}`,
    });
    expect(response.statusCode).toBe(200);
    expect(operations.compareRevisions).toHaveBeenCalledWith({
      id,
      fromRevisionId: revisionId,
      toRevisionId: revisionId,
    });
    expect(
      (
        await app.inject({
          url: `/api/v1/plannings/${id}/revisions/comparison?fromRevisionId=${revisionId}`,
        })
      ).statusCode,
    ).toBe(400);
    expect(operations.compareRevisions).toHaveBeenCalledTimes(1);
  });
  it('encaminha o checklist da revisão e o pedido de cópia com os cadastros atuais', async () => {
    const operations = setup();
    const response = await app.inject({
      url: `/api/v1/plannings/${id}/revisions/${revisionId}/checklist`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ revisionId, complete: false });
    expect(operations.revisionChecklist).toHaveBeenCalledWith({ id, revisionId });
    expect(
      (await app.inject({ url: `/api/v1/plannings/${id}/revisions/invalid/checklist` })).statusCode,
    ).toBe(400);

    vi.mocked(operations.createPlanning).mockResolvedValue({} as never);
    const copy = {
      name: 'Plano seguinte',
      year: 2028,
      sourceId: id,
      sourceVersion: 2,
      base: 'current',
      keepGrid: false,
    };
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/plannings', payload: copy })).statusCode,
    ).toBe(201);
    expect(operations.createPlanning).toHaveBeenCalledWith(copy);
    for (const payload of [
      { name: 'Plano', year: 2028, base: 'current' },
      { ...copy, base: 'outra' },
    ])
      expect(
        (await app.inject({ method: 'POST', url: '/api/v1/plannings', payload })).statusCode,
      ).toBe(400);

    vi.mocked(operations.changePlanning).mockResolvedValue({} as never);
    const review = { version: 1, operation: 'review', revisionId, reviewedItems: ['rules'] };
    expect(
      (await app.inject({ method: 'PUT', url: `/api/v1/plannings/${id}`, payload: review }))
        .statusCode,
    ).toBe(200);
    expect(operations.changePlanning).toHaveBeenCalledWith({ ...review, id });
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/v1/plannings/${id}`,
          payload: { ...review, reviewedItems: ['outro'] },
        })
      ).statusCode,
    ).toBe(400);
    expect(operations.changePlanning).toHaveBeenCalledTimes(1);
  });
  it('entrada inválida não chega aos casos de uso', async () => {
    const operations = setup();
    for (const payload of [
      { name: 'Nome' },
      { version: 0, name: 'Nome' },
      { version: 1, name: 'x'.repeat(101) },
    ]) {
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: `/api/v1/plannings/${id}/revisions/${revisionId}/name`,
            payload,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(operations.renameRevision).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/plannings/${id}/revisions/invalid/restore`,
          payload: { version: 1 },
        })
      ).statusCode,
    ).toBe(400);
    expect(operations.restoreRevision).not.toHaveBeenCalled();
  });
});
