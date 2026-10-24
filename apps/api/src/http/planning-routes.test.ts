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
    renameRevision: vi.fn(async () => ({ id, version: 2 })),
    restoreRevision: vi.fn(async () => ({ id, version: 2, revisionId })),
  };
  app = buildTestApp({});
  registerPlanningRoutes(app, operations);
  return operations;
}
describe('HTTP das versões de planejamento', () => {
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
