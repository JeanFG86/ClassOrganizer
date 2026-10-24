import {
  ResourceNameAlreadyInUseError,
  StaleVersionError,
  ResourceEntity,
} from '@classorganizer/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDatabase } from '../../testing/postgres-container.ts';
import type { TestDatabase } from '../../testing/postgres-container.ts';
import { PrismaResourceRepository } from './prisma-resource-repository.ts';

const createdAt = new Date('2026-03-01T10:00:00.000Z');
const LAB = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
const COURT = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2';

describe('PrismaResourceRepository (PostgreSQL)', () => {
  let testDb: TestDatabase;
  let resources: PrismaResourceRepository;

  beforeAll(async () => {
    testDb = await startTestDatabase();
    resources = new PrismaResourceRepository(testDb.db);
  });
  afterAll(async () => {
    await testDb?.stop();
  });
  beforeEach(async () => {
    await testDb.truncateAll();
  });

  it('grava, busca pelo nome normalizado, atualiza com versão e informa a situação', async () => {
    const lab = ResourceEntity.create({ id: LAB, name: 'Laboratório', createdAt }).snapshot();
    await resources.add(lab);
    expect(await resources.findById(LAB)).toEqual(lab);
    expect(await resources.findByNormalizedName(lab.normalizedName)).toEqual(lab);
    expect(await resources.findById('nao-e-uuid')).toBeNull();
    const archived = await resources.update({ ...lab, archivedAt: createdAt });
    expect(archived.version).toBe(2);
    await expect(resources.update(lab)).rejects.toThrow(StaleVersionError);
    expect(await resources.resourceStatuses([LAB, COURT, 'x'])).toEqual(
      new Map([[LAB, 'archived']]),
    );
    expect(await resources.listAll()).toEqual([archived]);
  });

  it('recusa nome repetido, inclusive ao renomear, e nome vazio direto no banco', async () => {
    await resources.add(
      ResourceEntity.create({ id: LAB, name: 'Laboratório', createdAt }).snapshot(),
    );
    await expect(
      resources.add(
        ResourceEntity.create({ id: COURT, name: 'laboratorio', createdAt }).snapshot(),
      ),
    ).rejects.toThrow(ResourceNameAlreadyInUseError);
    const court = ResourceEntity.create({ id: COURT, name: 'Quadra', createdAt }).snapshot();
    await resources.add(court);
    await expect(
      resources.update({ ...court, name: 'Laboratório', normalizedName: 'laboratorio' }),
    ).rejects.toThrow(ResourceNameAlreadyInUseError);
    await expect(
      testDb.db.resource.update({ where: { id: COURT }, data: { name: '  ' } }),
    ).rejects.toThrow(/resource_name_not_blank/);
  });
});
